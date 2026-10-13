import { z } from "zod";
import { type TokenGrant, TWITCH_REDIRECT_URI, type TwitchIdentity } from "../domain/twitch.rules";
import type { AuthResult, TwitchAuthPort } from "../usecase/twitch-connection.usecase";

export type TwitchAuthClientSettings = {
  clientId: string;
  clientSecret: string;
  // Le réseau et l'adresse de Twitch sont injectés : les tests parlent à un faux Twitch, jamais au vrai.
  fetcher?: typeof fetch;
  idUrl?: string;
  delayMs?: number;
};

const DEFAULT_ID_URL = "https://id.twitch.tv";
const DEFAULT_DELAY_MS = 10_000;
const MAX_REASON_LENGTH = 80;

// Twitch écrit `access_token`, `refresh_token`, `expires_in`, `user_id` en snake_case : ces champs se lisent dans l'objet,
// sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());

const refused = (status: number, reason: string): AuthResult<never> => ({
  ok: false,
  isRefused: status >= 400 && status < 500 && status !== 408 && status !== 429,
  message: reason,
});

const unreadable = (what: string): AuthResult<never> => ({
  ok: false,
  isRefused: false,
  message: `${what} illisible`,
});

// La raison que Twitch donne à un refus (`message`), courte : elle ne porte jamais un jeton, seulement « Invalid refresh token ».
const toReason = async (response: Response): Promise<string> => {
  const body = ObjectSchema.safeParse(await response.json().catch(() => undefined));
  const message = body.success ? z.string().safeParse(body.data.message) : undefined;
  const detail = message?.success ? ` : ${message.data.slice(0, MAX_REASON_LENGTH)}` : "";
  return `HTTP ${response.status}${detail}`;
};

// L'échange de code, le renouvellement, le compte derrière un jeton et sa révocation : les appels de l'application Twitch qui
// portent son secret. Les messages d'erreur ne portent jamais le jeton, le code ni le secret : un code HTTP, la raison de
// Twitch ou « illisible ».
export function createTwitchAuthClient({
  clientId,
  clientSecret,
  fetcher = fetch,
  idUrl = DEFAULT_ID_URL,
  delayMs = DEFAULT_DELAY_MS,
}: TwitchAuthClientSettings): TwitchAuthPort {
  const post = async (path: string, form: [string, string][]): Promise<Response> =>
    fetcher(`${idUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(delayMs),
    });

  // Un appel dont le réseau tombe est un échec sans refus : on pourra réessayer.
  const attempt = async <Value>(run: () => Promise<AuthResult<Value>>): Promise<AuthResult<Value>> => {
    try {
      return await run();
    } catch (error) {
      return { ok: false, isRefused: false, message: error instanceof Error ? error.message : "réseau" };
    }
  };

  const toGrant = async (response: Response): Promise<AuthResult<TokenGrant>> => {
    if (!response.ok) return refused(response.status, await toReason(response));
    const body = ObjectSchema.safeParse(await response.json().catch(() => undefined));
    if (!body.success) return unreadable("jeton");
    const accessToken = z.string().min(1).safeParse(body.data.access_token);
    const refreshToken = z.string().min(1).safeParse(body.data.refresh_token);
    const expiresIn = z.number().positive().safeParse(body.data.expires_in);
    if (!accessToken.success || !refreshToken.success || !expiresIn.success) return unreadable("jeton");
    return {
      ok: true,
      value: { accessToken: accessToken.data, refreshToken: refreshToken.data, expiresIn: expiresIn.data },
    };
  };

  const toIdentity = async (response: Response): Promise<AuthResult<TwitchIdentity>> => {
    if (!response.ok) return refused(response.status, await toReason(response));
    const body = ObjectSchema.safeParse(await response.json().catch(() => undefined));
    if (!body.success) return unreadable("compte");
    const login = z.string().min(1).safeParse(body.data.login);
    const userId = z.string().min(1).safeParse(body.data.user_id);
    const scopes = z.array(z.string()).safeParse(body.data.scopes);
    if (!login.success || !userId.success) return unreadable("compte");
    return {
      ok: true,
      value: { login: login.data, userId: userId.data, scope: scopes.success ? scopes.data.join(" ") : "" },
    };
  };

  return {
    exchangeCode: (code) =>
      attempt(async () =>
        toGrant(
          await post("/oauth2/token", [
            ["client_id", clientId],
            ["client_secret", clientSecret],
            ["code", code],
            ["grant_type", "authorization_code"],
            ["redirect_uri", TWITCH_REDIRECT_URI],
          ]),
        ),
      ),
    refresh: (refreshToken) =>
      attempt(async () =>
        toGrant(
          await post("/oauth2/token", [
            ["client_id", clientId],
            ["client_secret", clientSecret],
            ["grant_type", "refresh_token"],
            ["refresh_token", refreshToken],
          ]),
        ),
      ),
    getIdentity: (accessToken) =>
      attempt(async () =>
        toIdentity(
          await fetcher(`${idUrl}/oauth2/validate`, {
            headers: { authorization: `OAuth ${accessToken}` },
            signal: AbortSignal.timeout(delayMs),
          }),
        ),
      ),
    revoke: (accessToken) =>
      attempt(async () => {
        const response = await post("/oauth2/revoke", [
          ["client_id", clientId],
          ["token", accessToken],
        ]);
        return response.ok ? { ok: true, value: null } : refused(response.status, await toReason(response));
      }),
  };
}
