import { TWITCH_TOPICS, type TwitchToken, type TwitchTopic } from "./twitch.schema";

// Chaque abonnement EventSub du renard : son type et sa version chez Twitch, le droit du jeton qu'il demande, et son nom au
// pluriel pour le journal et l'onglet Twitch (« aux follows », « les follows »).
export const TWITCH_TOPIC_SPECS: Readonly<
  Record<TwitchTopic, { type: string; version: string; scope: string; text: string }>
> = {
  follow: { type: "channel.follow", version: "2", scope: "moderator:read:followers", text: "follows" },
  reward: {
    type: "channel.channel_points_custom_reward_redemption.add",
    version: "1",
    // `manage` couvre la lecture des redemptions, et la soundboard en a besoin pour créer, modifier, supprimer ses rewards et
    // marquer un rachat (FULFILLED, CANCELED).
    scope: "channel:manage:redemptions",
    text: "récompenses de points de chaîne",
  },
  prediction: {
    type: "channel.prediction.end",
    version: "1",
    scope: "channel:read:predictions",
    text: "prédictions",
  },
};

// Les droits que le renard demande à Alexis, séparés par des espaces : un par abonnement.
export const TWITCH_SCOPE = TWITCH_TOPICS.map((topic) => TWITCH_TOPIC_SPECS[topic].scope).join(" ");

// Où Twitch renvoie le navigateur après l'autorisation. Twitch le compare à la lettre à l'adresse enregistrée dans l'application :
// il est écrit ici en entier, port compris.
export const TWITCH_REDIRECT_URI = "http://localhost:4747/auth/twitch/callback";

const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";

// Un jeton d'accès se renouvelle une minute avant la fin de sa validité.
export const RENEW_BEFORE_MS = 60_000;

// L'adresse où Alexis autorise l'application : le `state` revient tel quel au retour, et prouve qu'il vient de cette demande.
export function toAuthorizeUrl({ clientId, state }: { clientId: string; state: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", TWITCH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TWITCH_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export const isTokenFresh = ({ expiresAt }: Pick<TwitchToken, "expiresAt">, now: number): boolean =>
  now < expiresAt - RENEW_BEFORE_MS;

const hasScope = (granted: string, scope: string): boolean => granted.split(/\s+/).includes(scope);

// Le droit de voir les follows fait partie de ceux que Twitch a donnés : sans lui, la connexion ne sert à rien.
export const hasTwitchScope = (scope: string): boolean => hasScope(scope, TWITCH_TOPIC_SPECS.follow.scope);

// Les abonnements que les droits du jeton permettent, dans l'ordre de TWITCH_TOPICS, et ceux qu'ils ne permettent pas.
export const toGrantedTopics = (scope: string): TwitchTopic[] =>
  TWITCH_TOPICS.filter((topic) => hasScope(scope, TWITCH_TOPIC_SPECS[topic].scope));
export const toMissingTopics = (scope: string): TwitchTopic[] =>
  TWITCH_TOPICS.filter((topic) => !hasScope(scope, TWITCH_TOPIC_SPECS[topic].scope));

// « les follows », « les follows et les récompenses de points de chaîne », « les follows, les récompenses et les prédictions ».
export const toTopicsText = (topics: readonly TwitchTopic[]): string => {
  const texts = topics.map((topic) => `les ${TWITCH_TOPIC_SPECS[topic].text}`);
  const last = texts.pop();
  return texts.length === 0 ? (last ?? "") : `${texts.join(", ")} et ${last}`;
};

// Ce que Twitch donne à un échange de code ou à un renouvellement : un jeton d'accès valable `expiresIn` secondes, et le jeton
// pour en demander un autre.
export type TokenGrant = { accessToken: string; refreshToken: string; expiresIn: number };

// Le compte derrière un jeton d'accès, et les droits qu'il porte.
export type TwitchIdentity = { login: string; userId: string; scope: string };

export const toTwitchToken = (grant: TokenGrant, identity: TwitchIdentity, now: number): TwitchToken => ({
  accessToken: grant.accessToken,
  refreshToken: grant.refreshToken,
  expiresAt: now + grant.expiresIn * 1000,
  login: identity.login,
  userId: identity.userId,
  scope: identity.scope,
});

// Un renouvellement garde le compte et les droits, et prend le nouveau jeton d'accès, le nouveau jeton de renouvellement
// (Twitch en donne un autre à chaque fois) et sa nouvelle fin.
export const toRenewedToken = (token: TwitchToken, grant: TokenGrant, now: number): TwitchToken => ({
  ...token,
  accessToken: grant.accessToken,
  refreshToken: grant.refreshToken,
  expiresAt: now + grant.expiresIn * 1000,
});
