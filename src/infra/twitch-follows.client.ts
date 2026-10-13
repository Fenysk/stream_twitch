import { z } from "zod";
import type { FollowFeedPort, FollowFeedTarget } from "../usecase/twitch-connection.usecase";

// Un WebSocket réduit à ce dont le flux a besoin ; les tests le jouent à la main, `createFeedSocket` l'implémente avec le
// WebSocket de Node.
export type FeedSocket = {
  listen(listener: { onMessage(text: string): void; onClose(): void }): void;
  close(): void;
};

export type FollowFeedSettings = {
  clientId: string;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
  // Le réseau, l'horloge et les adresses de Twitch sont injectés : les tests parlent à un faux Twitch, jamais au vrai.
  fetcher?: typeof fetch;
  clock?: () => number;
  createSocket?: (url: string) => FeedSocket;
  socketUrl?: string;
  apiUrl?: string;
  delayMs?: number;
};

const DEFAULT_SOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";
const DEFAULT_API_URL = "https://api.twitch.tv";
const DEFAULT_DELAY_MS = 10_000;
// Twitch ferme une connexion qui ne s'abonne pas dans les 10 s ; on lui laisse le temps de renouveler un jeton.
const KEEPALIVE_MARGIN = 1.5;
const FIRST_KEEPALIVE_S = 10;
const RETRY_FIRST_MS = 5000;
const RETRY_MAX_MS = 60_000;
// Les notifications de plus de 10 min sont des rediffusions (Twitch le conseille) : on les ignore.
const MAX_AGE_MS = 10 * 60_000;
const SEEN_KEPT = 200;

// Twitch écrit `message_type`, `session_id`, `user_name`… en snake_case : ces champs se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());
type Fields = z.infer<typeof ObjectSchema>;

const getText = (fields: Fields, key: string): string | undefined => {
  const text = z.string().min(1).safeParse(fields[key]);
  return text.success ? text.data : undefined;
};

const getFields = (value: unknown): Fields => {
  const parsed = ObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

// Le corps de la demande d'abonnement ; les champs de Twitch sont en snake_case, ils se composent depuis des paires.
const toRecord = (entries: [string, unknown][]): Record<string, unknown> => Object.fromEntries(entries);

const toSubscription = ({ broadcasterId, moderatorId }: FollowFeedTarget, sessionId: string): string =>
  JSON.stringify(
    toRecord([
      ["type", "channel.follow"],
      ["version", "2"],
      [
        "condition",
        toRecord([
          ["broadcaster_user_id", broadcasterId],
          ["moderator_user_id", moderatorId],
        ]),
      ],
      [
        "transport",
        toRecord([
          ["method", "websocket"],
          ["session_id", sessionId],
        ]),
      ],
    ]),
  );

export const createFeedSocket = (url: string): FeedSocket => {
  const socket = new WebSocket(url);
  return {
    listen({ onMessage, onClose }) {
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") onMessage(event.data);
      });
      socket.addEventListener("close", onClose);
      socket.addEventListener("error", onClose);
    },
    close: () => socket.close(),
  };
};

// Une connexion à EventSub. `isMigration` : Twitch a demandé de passer à cette adresse (`session_reconnect`), les abonnements
// suivent sans qu'on les refasse. `keepaliveSeconds` : le silence que Twitch annonce entre deux de ses messages.
type Link = {
  socket: FeedSocket;
  isMigration: boolean;
  isClosed: boolean;
  keepaliveSeconds: number;
  cancelWatch: (() => void) | undefined;
};

// Le flux des follows par EventSub (WebSocket) : il s'abonne à `channel.follow` (version 2) avec le jeton du modérateur, se
// reconnecte seul tant qu'il n'est pas fermé, et ne donne chaque follow qu'une fois. Les messages d'erreur ne portent jamais
// le jeton : un code HTTP seulement.
export function createFollowFeed({
  clientId,
  schedule,
  log,
  fetcher = fetch,
  clock = Date.now,
  createSocket = createFeedSocket,
  socketUrl = DEFAULT_SOCKET_URL,
  apiUrl = DEFAULT_API_URL,
  delayMs = DEFAULT_DELAY_MS,
}: FollowFeedSettings): FollowFeedPort {
  let target: FollowFeedTarget | undefined;
  // La connexion qui nous sert, et celle vers laquelle Twitch nous fait migrer.
  let current: Link | undefined;
  let incoming: Link | undefined;
  let cancelRetry: (() => void) | undefined;
  let failures = 0;
  let isInterruptionLogged = false;
  const seen: string[] = [];

  const closeLink = (link: Link | undefined) => {
    if (!link || link.isClosed) return;
    link.isClosed = true;
    link.cancelWatch?.();
    link.socket.close();
  };

  const retry = () => {
    if (!target || cancelRetry) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.min(failures, 4));
    failures += 1;
    cancelRetry = schedule(() => {
      cancelRetry = undefined;
      if (target) connect(socketUrl, false);
    }, delay);
  };

  // Une connexion tombe : celle qui nous sert est remplacée (nouvel essai), celle de la migration est abandonnée, une
  // ancienne déjà fermée n'est plus rien.
  const lose = (link: Link, why: string) => {
    closeLink(link);
    if (link === incoming) {
      incoming = undefined;
      return;
    }
    if (link !== current) return;
    current = undefined;
    if (!target) return;
    if (!isInterruptionLogged) log(`Twitch : flux des follows interrompu (${why}), nouvel essai.`);
    isInterruptionLogged = true;
    retry();
  };

  // Rien ne vient de Twitch depuis plus longtemps que son délai de silence (plus une marge) : la connexion est morte.
  const watch = (link: Link) => {
    link.cancelWatch?.();
    link.cancelWatch = schedule(
      () => lose(link, "Twitch ne répond plus"),
      Math.round(link.keepaliveSeconds * 1000 * KEEPALIVE_MARGIN),
    );
  };

  const subscribe = async (link: Link, sessionId: string, isForced: boolean): Promise<void> => {
    const active = target;
    if (!active) return;
    const access = await active.getAccessToken(isForced);
    if (!access) {
      lose(link, "pas de jeton");
      return;
    }
    const response = await fetcher(`${apiUrl}/helix/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access}`,
        "client-id": clientId,
        "content-type": "application/json",
      },
      body: toSubscription(active, sessionId),
      signal: AbortSignal.timeout(delayMs),
    });
    if (response.status === 401 && !isForced) {
      await subscribe(link, sessionId, true);
      return;
    }
    if (!response.ok) {
      log(`Twitch : abonnement aux follows refusé (HTTP ${response.status}).`);
      lose(link, `abonnement refusé, HTTP ${response.status}`);
      return;
    }
    failures = 0;
    isInterruptionLogged = false;
    log("Twitch : abonné aux follows (EventSub).");
  };

  const handleWelcome = (link: Link, payload: Fields) => {
    const session = getFields(payload.session);
    const sessionId = getText(session, "id");
    const seconds = z.number().positive().safeParse(session.keepalive_timeout_seconds);
    if (seconds.success) link.keepaliveSeconds = seconds.data;
    watch(link);
    if (!sessionId) return;
    if (link.isMigration) {
      closeLink(current);
      current = link;
      incoming = undefined;
      return;
    }
    closeLink(current);
    current = link;
    void subscribe(link, sessionId, false).catch((error: unknown) => {
      log(
        `Twitch : abonnement aux follows impossible (${error instanceof Error ? error.message : "réseau"}).`,
      );
      lose(link, "abonnement impossible");
    });
  };

  const handleMigration = (payload: Fields) => {
    const url = getText(getFields(payload.session), "reconnect_url");
    if (url && !incoming) connect(url, true);
  };

  const isReplay = (metadata: Fields): boolean => {
    const stamp = getText(metadata, "message_timestamp");
    const at = stamp === undefined ? Number.NaN : Date.parse(stamp);
    return Number.isFinite(at) && clock() - at > MAX_AGE_MS;
  };

  // Twitch peut donner deux fois le même message (après une reconnexion) : chaque identifiant ne passe qu'une fois.
  const isRepeated = (id: string | undefined): boolean => {
    if (id === undefined) return false;
    if (seen.includes(id)) return true;
    seen.push(id);
    if (seen.length > SEEN_KEPT) seen.shift();
    return false;
  };

  const handleNotification = (metadata: Fields, payload: Fields) => {
    if (getText(metadata, "subscription_type") !== "channel.follow") return;
    if (isRepeated(getText(metadata, "message_id")) || isReplay(metadata)) return;
    const event = getFields(payload.event);
    const nickname = getText(event, "user_name") ?? getText(event, "user_login");
    if (nickname) target?.onFollow(nickname);
  };

  const handleRevocation = (payload: Fields) => {
    const reason = getText(getFields(payload.subscription), "status") ?? "raison inconnue";
    log(`Twitch : l'abonnement aux follows a été retiré par Twitch (${reason}).`);
  };

  const handle = (link: Link, text: string) => {
    if (link.isClosed) return;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    const fields = getFields(message);
    const metadata = getFields(fields.metadata);
    const payload = getFields(fields.payload);
    // Toute parole de Twitch (même un simple « je suis là ») prouve que la connexion vit.
    watch(link);
    switch (getText(metadata, "message_type")) {
      case "session_welcome":
        handleWelcome(link, payload);
        break;
      case "session_reconnect":
        handleMigration(payload);
        break;
      case "notification":
        handleNotification(metadata, payload);
        break;
      case "revocation":
        handleRevocation(payload);
        break;
    }
  };

  function connect(url: string, isMigration: boolean) {
    const link: Link = {
      socket: createSocket(url),
      isMigration,
      isClosed: false,
      keepaliveSeconds: FIRST_KEEPALIVE_S,
      cancelWatch: undefined,
    };
    if (isMigration) incoming = link;
    watch(link);
    link.socket.listen({
      onMessage: (text) => handle(link, text),
      onClose: () => lose(link, "connexion coupée"),
    });
  }

  return {
    open(next) {
      target = next;
      failures = 0;
      isInterruptionLogged = false;
      connect(socketUrl, false);
    },
    close() {
      target = undefined;
      cancelRetry?.();
      cancelRetry = undefined;
      closeLink(current);
      closeLink(incoming);
      current = undefined;
      incoming = undefined;
    },
  };
}
