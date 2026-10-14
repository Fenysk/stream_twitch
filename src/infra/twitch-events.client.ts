import { z } from "zod";
import type { LiveEvent } from "../domain/live.types";
import { toPredictionLosers } from "../domain/prediction.rules";
import { TWITCH_TOPIC_SPECS } from "../domain/twitch.rules";
import { TWITCH_TOPICS, type TwitchTopic } from "../domain/twitch.schema";
import type { EventFeedPort, EventFeedTarget } from "../usecase/twitch-connection.usecase";

// Un WebSocket réduit à ce dont le flux a besoin ; les tests le jouent à la main, `createFeedSocket` l'implémente avec le
// WebSocket de Node.
export type FeedSocket = {
  listen(listener: { onMessage(text: string): void; onClose(): void }): void;
  close(): void;
};

export type EventFeedSettings = {
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

// Les follows se voient en tant que modérateur de la chaîne ; les récompenses, en tant que son propriétaire.
const toCondition = (
  topic: TwitchTopic,
  { broadcasterId, moderatorId }: EventFeedTarget,
): [string, unknown][] =>
  topic === "follow"
    ? [
        ["broadcaster_user_id", broadcasterId],
        ["moderator_user_id", moderatorId],
      ]
    : [["broadcaster_user_id", broadcasterId]];

const toSubscription = (target: EventFeedTarget, topic: TwitchTopic, sessionId: string): string =>
  JSON.stringify(
    toRecord([
      ["type", TWITCH_TOPIC_SPECS[topic].type],
      ["version", TWITCH_TOPIC_SPECS[topic].version],
      ["condition", toRecord(toCondition(topic, target))],
      [
        "transport",
        toRecord([
          ["method", "websocket"],
          ["session_id", sessionId],
        ]),
      ],
    ]),
  );

const toTopic = (type: string | undefined): TwitchTopic | undefined =>
  TWITCH_TOPICS.find((topic) => TWITCH_TOPIC_SPECS[topic].type === type);

const toNickname = (event: Fields): string | undefined =>
  getText(event, "user_name") ?? getText(event, "user_login");

// Les issues d'une prédiction terminée : Twitch en donne d'autres champs (couleur, points, meilleurs parieurs), jamais lus.
const OutcomesSchema = z.array(
  z.object({ id: z.string().min(1), title: z.string(), users: z.number().int().min(0) }),
);

// Une prédiction annulée (statut `canceled`) ou sans issue gagnante lisible ne donne rien.
const toPrediction = (event: Fields): LiveEvent | null => {
  const winningId = getText(event, "winning_outcome_id");
  const outcomes = OutcomesSchema.safeParse(event.outcomes);
  if (getText(event, "status") !== "resolved" || !winningId || !outcomes.success) return null;
  const result = toPredictionLosers(outcomes.data, winningId);
  return result && { kind: "prediction", ...result };
};

// Ce qu'une notification donne au renard, pour chaque abonnement ; `null` quand l'essentiel manque. Le texte qu'un viewer joint à
// sa récompense (`user_input`) n'est jamais lu.
const EVENTS: Readonly<Record<TwitchTopic, (event: Fields) => LiveEvent | null>> = {
  follow: (event) => {
    const user = toNickname(event);
    return user ? { kind: "follow", user } : null;
  },
  reward: (event) => {
    const user = toNickname(event);
    const title = getText(getFields(event.reward), "title");
    return user && title ? { kind: "reward", user, title } : null;
  },
  prediction: toPrediction,
};

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

// Ce que Twitch a répondu à une demande d'abonnement : accepté, refusé (avec son code HTTP), ou pas de jeton à lui donner ;
// `failed` : la demande n'a pas pu partir ou revenir (réseau).
type Outcome =
  | { kind: "ok" }
  | { kind: "refused"; status: number }
  | { kind: "no-token" }
  | { kind: "failed"; message: string };

const toOutcome = (response: Response | null): Outcome => {
  if (response === null) return { kind: "no-token" };
  return response.ok ? { kind: "ok" } : { kind: "refused", status: response.status };
};

// La ligne du journal d'un abonnement ; jamais le jeton. Sans jeton, c'est la connexion qui le dit.
const toOutcomeLog = (topic: TwitchTopic, outcome: Outcome): string | null => {
  const { text } = TWITCH_TOPIC_SPECS[topic];
  switch (outcome.kind) {
    case "ok":
      return `Twitch : abonné aux ${text} (EventSub).`;
    case "refused":
      return `Twitch : abonnement aux ${text} refusé (HTTP ${outcome.status}).`;
    case "failed":
      return `Twitch : abonnement aux ${text} impossible (${outcome.message}).`;
    case "no-token":
      return null;
  }
};

// Pourquoi la connexion tombe après ces abonnements, ou `null` quand elle reste : un abonnement obtenu suffit, sauf si le jeton a
// manqué ou le réseau est tombé au milieu (les suivants n'ont pas été tentés).
const toLossReason = (outcomes: readonly Outcome[]): string | null => {
  const last = outcomes.at(-1);
  if (last?.kind === "no-token") return "pas de jeton";
  if (last?.kind === "failed") return "abonnement impossible";
  if (outcomes.some(({ kind }) => kind === "ok")) return null;
  return last?.kind === "refused" ? `abonnement refusé, HTTP ${last.status}` : "aucun abonnement";
};

// Le jeton d'une connexion : celui du moment, puis un autre (forcé) dès que Twitch en refuse un (401), une seule fois.
type Access = { token: string | null; isForced: boolean };

// Une connexion à EventSub. `isMigration` : Twitch a demandé de passer à cette adresse (`session_reconnect`), les abonnements
// suivent sans qu'on les refasse. `keepaliveSeconds` : le silence que Twitch annonce entre deux de ses messages.
type Link = {
  socket: FeedSocket;
  isMigration: boolean;
  isClosed: boolean;
  keepaliveSeconds: number;
  cancelWatch: (() => void) | undefined;
};

// Le flux des évènements par EventSub (WebSocket) : il s'abonne à chacun des `topics` du jeton du modérateur (les follows en
// version 2, les récompenses de points de chaîne), se reconnecte seul tant qu'il n'est pas fermé, et ne donne chaque
// notification qu'une fois. Les messages d'erreur ne portent jamais le jeton : un code HTTP seulement.
export function createEventFeed({
  clientId,
  schedule,
  log,
  fetcher = fetch,
  clock = Date.now,
  createSocket = createFeedSocket,
  socketUrl = DEFAULT_SOCKET_URL,
  apiUrl = DEFAULT_API_URL,
  delayMs = DEFAULT_DELAY_MS,
}: EventFeedSettings): EventFeedPort {
  let target: EventFeedTarget | undefined;
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
    if (!isInterruptionLogged) log(`Twitch : flux des évènements interrompu (${why}), nouvel essai.`);
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

  const post = (active: EventFeedTarget, access: string, topic: TwitchTopic, sessionId: string) =>
    fetcher(`${apiUrl}/helix/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access}`,
        "client-id": clientId,
        "content-type": "application/json",
      },
      body: toSubscription(active, topic, sessionId),
      signal: AbortSignal.timeout(delayMs),
    });

  // Une demande d'abonnement ; un 401 fait redemander un jeton forcé (une fois par connexion), et recommence. `null` : pas de jeton.
  const send = async (
    active: EventFeedTarget,
    topic: TwitchTopic,
    sessionId: string,
    access: Access,
  ): Promise<Response | null> => {
    if (!access.token) return null;
    const response = await post(active, access.token, topic, sessionId);
    if (response.status !== 401 || access.isForced) return response;
    access.isForced = true;
    access.token = await active.getAccessToken(true);
    return access.token ? post(active, access.token, topic, sessionId) : null;
  };

  const request = async (
    active: EventFeedTarget,
    topic: TwitchTopic,
    sessionId: string,
    access: Access,
  ): Promise<Outcome> => {
    try {
      return toOutcome(await send(active, topic, sessionId, access));
    } catch (error) {
      return { kind: "failed", message: error instanceof Error ? error.message : "réseau" };
    }
  };

  // Un abonnement par évènement écouté, avec le même jeton, jusqu'à ce que le jeton manque ou que le réseau tombe.
  const collect = async (active: EventFeedTarget, sessionId: string): Promise<Outcome[]> => {
    const access: Access = { token: await active.getAccessToken(false), isForced: false };
    const outcomes: Outcome[] = [];
    for (const topic of active.topics) {
      const outcome = await request(active, topic, sessionId, access);
      outcomes.push(outcome);
      const line = toOutcomeLog(topic, outcome);
      if (line) log(line);
      if (outcome.kind === "no-token" || outcome.kind === "failed") break;
    }
    return outcomes;
  };

  // La connexion ne tombe que si aucun abonnement n'a réussi : une récompense refusée ne coupe pas les follows.
  const subscribe = async (link: Link, sessionId: string): Promise<void> => {
    if (!target) return;
    const loss = toLossReason(await collect(target, sessionId));
    if (loss) {
      lose(link, loss);
      return;
    }
    failures = 0;
    isInterruptionLogged = false;
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
    void subscribe(link, sessionId).catch((error: unknown) => {
      log(
        `Twitch : abonnement aux évènements impossible (${error instanceof Error ? error.message : "réseau"}).`,
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
    const topic = toTopic(getText(metadata, "subscription_type"));
    if (!topic) return;
    if (isRepeated(getText(metadata, "message_id")) || isReplay(metadata)) return;
    const event = EVENTS[topic](getFields(payload.event));
    if (event) target?.onEvent(event);
  };

  const handleRevocation = (payload: Fields) => {
    const subscription = getFields(payload.subscription);
    const topic = toTopic(getText(subscription, "type"));
    const reason = getText(subscription, "status") ?? "raison inconnue";
    log(
      `Twitch : l'abonnement aux ${topic ? TWITCH_TOPIC_SPECS[topic].text : "évènements"} a été retiré par Twitch (${reason}).`,
    );
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
