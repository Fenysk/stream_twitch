import { z } from "zod";

export type AppTokenSettings = {
  clientId: string;
  clientSecret: string;
  // Le réseau et l'horloge sont injectés : les tests n'appellent jamais le vrai Twitch.
  fetcher?: typeof fetch;
  clock?: () => number;
  delayMs?: number;
};

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const DEFAULT_DELAY_MS = 10_000;
// Un jeton d'application se renouvelle une minute avant la fin de sa validité.
const RENEW_BEFORE_MS = 60_000;

// Twitch écrit ses champs en snake_case (`access_token`, `expires_in`, `viewer_count`…) : ils se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());

// Le corps JSON d'une réponse de Twitch, un objet ; sinon « réponse illisible ».
export async function getJsonObject(response: Response): Promise<Record<string, unknown>> {
  const parsed = ObjectSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new Error("réponse illisible");
  return parsed.data;
}

export type AppToken = {
  // Le jeton d'application, demandé à Twitch s'il manque ou va expirer.
  get(): Promise<string>;
  // Le jeton a été révoqué avant sa fin : le suivant sera redemandé.
  forget(): void;
};

type StoredToken = { value: string; expiresAt: number };

// Le jeton d'application de Twitch (« client credentials »), sans la connexion d'Alexis. Les messages d'erreur ne portent jamais
// le jeton ni le secret : seulement un code HTTP ou « illisible ».
export function createAppToken({
  clientId,
  clientSecret,
  fetcher = fetch,
  clock = Date.now,
  delayMs = DEFAULT_DELAY_MS,
}: AppTokenSettings): AppToken {
  let token: StoredToken | null = null;
  return {
    async get() {
      if (token && clock() < token.expiresAt - RENEW_BEFORE_MS) return token.value;
      const response = await fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams([
          ["client_id", clientId],
          ["client_secret", clientSecret],
          ["grant_type", "client_credentials"],
        ]),
        signal: AbortSignal.timeout(delayMs),
      });
      if (!response.ok) throw new Error(`jeton d'application refusé (HTTP ${response.status})`);
      const body = await getJsonObject(response);
      const value = z.string().min(1).safeParse(body.access_token);
      const expiresIn = z.number().positive().safeParse(body.expires_in);
      if (!value.success || !expiresIn.success) throw new Error("jeton d'application illisible");
      token = { value: value.data, expiresAt: clock() + expiresIn.data * 1000 };
      return token.value;
    },
    forget() {
      token = null;
    },
  };
}
