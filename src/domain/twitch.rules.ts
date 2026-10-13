import type { TwitchToken } from "./twitch.schema";

// Le droit que le renard demande : voir qui suit la chaîne (EventSub `channel.follow`).
export const TWITCH_SCOPE = "moderator:read:followers";

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

// Le droit demandé fait partie de ceux que Twitch a donnés.
export const hasTwitchScope = (scope: string): boolean => scope.split(/\s+/).includes(TWITCH_SCOPE);

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
