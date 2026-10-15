import type { LiveEvent } from "../domain/live.types";
import {
  hasTwitchScope,
  isTokenFresh,
  type TokenGrant,
  type TwitchIdentity,
  toAuthorizeUrl,
  toGrantedTopics,
  toMissingTopics,
  toRenewedToken,
  toTopicsText,
  toTwitchToken,
} from "../domain/twitch.rules";
import type { TwitchStatus, TwitchToken, TwitchTopic } from "../domain/twitch.schema";

// Le résultat d'une demande à Twitch : sa valeur, ou pourquoi elle a échoué. `isRefused` : Twitch a répondu non (code périmé,
// jeton retiré), pas de nouvel essai possible ; sinon il n'a pas répondu, ou pas comme il faut. Le message ne porte jamais un jeton.
export type AuthResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; isRefused: boolean; message: string };

export type TwitchAuthPort = {
  // Échange le code du retour d'autorisation contre un jeton.
  exchangeCode(code: string): Promise<AuthResult<TokenGrant>>;
  // Demande un autre jeton d'accès avec le jeton de renouvellement.
  refresh(refreshToken: string): Promise<AuthResult<TokenGrant>>;
  // Le compte derrière le jeton d'accès, et ses droits (Twitch demande de le vérifier chaque heure).
  getIdentity(accessToken: string): Promise<AuthResult<TwitchIdentity>>;
  // Retire le jeton chez Twitch.
  revoke(accessToken: string): Promise<AuthResult<null>>;
};

export type TokenStorePort = {
  get(): TwitchToken | null;
  update(token: TwitchToken): void;
  delete(): void;
};

export type EventFeedTarget = {
  // La chaîne dont on veut les évènements, et le modérateur qui les voit (le compte connecté).
  broadcasterId: string;
  moderatorId: string;
  // Les abonnements à ouvrir à chaque (re)connexion : ceux que les droits du jeton permettent.
  topics: readonly TwitchTopic[];
  // Un jeton d'accès valable à chaque (re)connexion ; `isForced` : Twitch vient de refuser le précédent, il faut un autre.
  getAccessToken: (isForced: boolean) => Promise<string | null>;
  onEvent: (event: LiveEvent) => void;
};

// Le flux des évènements EventSub (follows, récompenses) : il se reconnecte seul tant qu'il n'est pas fermé.
export type EventFeedPort = {
  open(options: EventFeedTarget): void;
  close(): void;
};

export type TwitchConnectionDeps = {
  // L'application Twitch (son identifiant, son client et son flux) ; `undefined` : ses identifiants manquent dans .env.
  app: { clientId: string; auth: TwitchAuthPort; feed: EventFeedPort } | undefined;
  store: TokenStorePort;
  // L'identifiant Twitch de la chaîne (`chatChannelId`).
  broadcasterId: string | undefined;
  // Un évènement du flux EventSub (un follow, une récompense) : il va aux remerciements.
  onEvent: (event: LiveEvent) => void;
  // Le jeton a le droit de gérer les récompenses et le flux est ouvert : les rewards des sons peuvent se remettre en route.
  // Absent sur un serveur d'essai.
  onReady?: () => void;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  createState: () => string;
  log: (message: string) => void;
};

// Ce que Twitch renvoie au navigateur après l'autorisation : le code et le state, ou l'erreur (ce que la page a lu de l'adresse).
export type LoginQuery = { code: string | null; state: string | null; error: string | null };

export type LoginResult = { ok: true; login: string } | { ok: false; message: string };

export type TwitchConnection = {
  // Relit le jeton gardé et écoute les évènements ; sans jeton, le journal dit une fois que les follows attendent.
  start(): Promise<void>;
  stop(): void;
  getStatus(): TwitchStatus;
  // Le jeton d'accès pour gérer les rewards des sons ; `null` : pas connecté, ou il manque le droit de gérer les récompenses
  // (reconnecte-toi).
  getRewardsToken(isForced: boolean): Promise<string | null>;
  // L'adresse où Alexis autorise l'application, avec un state neuf.
  beginLogin(): { ok: true; url: string } | { ok: false; message: string };
  // Le retour de Twitch : vérifie le state, échange le code, garde le jeton, écoute les évènements.
  completeLogin(query: LoginQuery): Promise<LoginResult>;
  // Retire le jeton (du fichier et chez Twitch) et n'écoute plus rien.
  disconnect(): Promise<void>;
};

const STATE_LIFETIME_MS = 10 * 60_000;
const STATES_KEPT = 5;
// Twitch demande de vérifier chaque heure qu'un jeton vaut encore.
const CONFIRM_PERIOD_MS = 60 * 60_000;
const MISSING_APP_MESSAGE = "TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env.";

// Une erreur de Twitch (`error=access_denied`) se lit dans l'adresse : seul un code court en minuscules passe dans le journal.
const toErrorText = (error: string): string =>
  error === "access_denied"
    ? "autorisation refusée sur Twitch"
    : /^[a-z_]{1,40}$/.test(error)
      ? `Twitch a refusé (${error})`
      : "Twitch a refusé l'autorisation";

export function createTwitchConnection({
  app,
  store,
  broadcasterId,
  onEvent,
  onReady,
  clock,
  schedule,
  createState,
  log,
}: TwitchConnectionDeps): TwitchConnection {
  let token: TwitchToken | null = null;
  let lastError: string | null = null;
  // Les state en attente de leur retour, avec leur fin ; chacun ne sert qu'une fois.
  const states = new Map<string, number>();
  let sharedRefresh: Promise<string | null> | undefined;
  let cancelVerify: (() => void) | undefined;

  // La connexion s'arrête : le jeton part du fichier, le flux se ferme.
  const forget = () => {
    token = null;
    store.delete();
    app?.feed.close();
    cancelVerify?.();
    cancelVerify = undefined;
  };

  const lose = (reason: string) => {
    forget();
    lastError = "La connexion à Twitch a expiré : reconnecte-toi.";
    log(`Twitch : connexion perdue (${reason}), reconnecte-toi depuis l'onglet Twitch.`);
  };

  const refresh = async (): Promise<string | null> => {
    const current = token;
    if (!app || !current) return null;
    const result = await app.auth.refresh(current.refreshToken);
    if (result.ok) {
      token = toRenewedToken(current, result.value, clock());
      store.update(token);
      return token.accessToken;
    }
    if (result.isRefused) lose(result.message);
    else log(`Twitch : jeton non renouvelé, nouvel essai plus tard (${result.message}).`);
    return null;
  };

  // Un seul renouvellement à la fois : deux demandes en même temps se partagent la réponse (Twitch change le jeton de
  // renouvellement à chaque fois, le second échangerait un jeton déjà périmé).
  const getAccessToken = async (isForced: boolean): Promise<string | null> => {
    if (!token) return null;
    if (!isForced && isTokenFresh(token, clock())) return token.accessToken;
    sharedRefresh ??= refresh().finally(() => {
      sharedRefresh = undefined;
    });
    return sharedRefresh;
  };

  const confirmIdentity = async () => {
    const access = await getAccessToken(false);
    if (!access || !app) return;
    const identity = await app.auth.getIdentity(access);
    if (!identity.ok && identity.isRefused) await getAccessToken(true);
  };

  const keepConfirming = () => {
    cancelVerify?.();
    cancelVerify = schedule(() => {
      void confirmIdentity().then(() => {
        if (token) keepConfirming();
      });
    }, CONFIRM_PERIOD_MS);
  };

  const listen = () => {
    if (!app || !token) return;
    if (broadcasterId === undefined) {
      log(
        "Twitch : l'identifiant de la chaîne (chatChannelId) manque dans settings.json, les follows attendent.",
      );
      return;
    }
    const topics = toGrantedTopics(token.scope);
    const missing = toMissingTopics(token.scope);
    if (missing.length > 0) {
      log(
        `Twitch : le jeton n'a pas le droit de voir ${toTopicsText(missing)} : reconnecte-toi depuis l'onglet Twitch.`,
      );
    }
    if (topics.length === 0) return;
    app.feed.close();
    app.feed.open({ broadcasterId, moderatorId: token.userId, topics, getAccessToken, onEvent });
    keepConfirming();
    if (topics.includes("reward")) onReady?.();
  };

  const isKnownState = (state: string | null): boolean => {
    if (state === null) return false;
    const expiresAt = states.get(state);
    states.delete(state);
    return expiresAt !== undefined && clock() < expiresAt;
  };

  // Le code contre un jeton, puis le compte et ses droits : rien n'est gardé tant que les deux ne sont pas bons.
  const exchange = async (code: string): Promise<{ token: TwitchToken } | { message: string }> => {
    if (!app) return { message: MISSING_APP_MESSAGE };
    const grant = await app.auth.exchangeCode(code);
    if (!grant.ok) return { message: `code refusé (${grant.message})` };
    const identity = await app.auth.getIdentity(grant.value.accessToken);
    if (!identity.ok) return { message: `compte illisible (${identity.message})` };
    if (!hasTwitchScope(identity.value.scope)) {
      return { message: "Twitch n'a pas donné le droit de voir les follows (moderator:read:followers)" };
    }
    return { token: toTwitchToken(grant.value, identity.value, clock()) };
  };

  const completeLogin = async (query: LoginQuery): Promise<LoginResult> => {
    const fail = (message: string): LoginResult => {
      lastError = `Connexion à Twitch échouée : ${message}.`;
      log(`Twitch : connexion échouée (${message}).`);
      return { ok: false, message };
    };
    if (!app) return fail(MISSING_APP_MESSAGE);
    if (query.error !== null) return fail(toErrorText(query.error));
    if (!isKnownState(query.state)) return fail("retour de Twitch inconnu ou trop ancien, recommence");
    if (!query.code) return fail("Twitch n'a pas donné de code");
    const exchanged = await exchange(query.code);
    if ("message" in exchanged) return fail(exchanged.message);
    token = exchanged.token;
    store.update(token);
    lastError = null;
    log(`Twitch : connecté en tant que ${token.login}.`);
    listen();
    return { ok: true, login: token.login };
  };

  return {
    async start() {
      if (!app) return;
      token = store.get();
      if (!token) {
        log(
          "Twitch : pas encore connecté, les follows attendent (onglet Twitch, « Se connecter à Twitch »).",
        );
        return;
      }
      log(
        `Twitch : connecté en tant que ${token.login}, ${toTopicsText(toGrantedTopics(token.scope))} sont écoutés.`,
      );
      listen();
    },
    stop() {
      app?.feed.close();
      cancelVerify?.();
      cancelVerify = undefined;
    },
    getStatus() {
      if (!app) return { kind: "unavailable" };
      return token
        ? { kind: "connected", login: token.login, missing: toMissingTopics(token.scope) }
        : { kind: "disconnected", lastError };
    },
    async getRewardsToken(isForced) {
      if (!token || toMissingTopics(token.scope).includes("reward")) return null;
      return getAccessToken(isForced);
    },
    beginLogin() {
      if (!app) return { ok: false, message: MISSING_APP_MESSAGE };
      for (const [state, expiresAt] of states) if (clock() >= expiresAt) states.delete(state);
      while (states.size >= STATES_KEPT) {
        const oldest = states.keys().next().value;
        if (oldest === undefined) break;
        states.delete(oldest);
      }
      const state = createState();
      states.set(state, clock() + STATE_LIFETIME_MS);
      lastError = null;
      return { ok: true, url: toAuthorizeUrl({ clientId: app.clientId, state }) };
    },
    completeLogin,
    async disconnect() {
      const current = token;
      if (!app || !current) return;
      forget();
      lastError = null;
      const revoked = await app.auth.revoke(current.accessToken);
      log(
        revoked.ok
          ? "Twitch : déconnecté, jeton retiré."
          : `Twitch : déconnecté, mais Twitch n'a pas retiré le jeton (${revoked.message}).`,
      );
    },
  };
}
