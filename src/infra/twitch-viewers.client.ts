import { z } from "zod";
import type { ViewersPort } from "../usecase/viewers.usecase";

export type ViewersClientSettings = {
  clientId: string;
  clientSecret: string;
  // L'identifiant Twitch de la chaîne ; sans lui, le nombre n'est jamais connu.
  channelId: string | undefined;
  // Le réseau et l'horloge sont injectés : les tests n'appellent jamais le vrai Twitch.
  fetcher?: typeof fetch;
  clock?: () => number;
  delayMs?: number;
};

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";
const DEFAULT_DELAY_MS = 10_000;
// Un jeton d'application se renouvelle une minute avant la fin de sa validité.
const RENEW_BEFORE_MS = 60_000;

// Twitch écrit `access_token`, `expires_in` et `viewer_count` en snake_case : ces champs se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());

type AppToken = { value: string; expiresAt: number };

// Le nombre de viewers du live par l'API Helix, avec un jeton d'application (« client credentials ») : il marche sans la
// connexion d'Alexis. Les messages d'erreur ne portent jamais le jeton ni le secret : seulement un code HTTP ou « illisible ».
export function createViewersClient({
  clientId,
  clientSecret,
  channelId,
  fetcher = fetch,
  clock = Date.now,
  delayMs = DEFAULT_DELAY_MS,
}: ViewersClientSettings): ViewersPort {
  let token: AppToken | null = null;

  const getJson = async (response: Response): Promise<Record<string, unknown>> => {
    const parsed = ObjectSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new Error("réponse illisible");
    return parsed.data;
  };

  const getToken = async (): Promise<string> => {
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
    const body = await getJson(response);
    const value = z.string().min(1).safeParse(body.access_token);
    const expiresIn = z.number().positive().safeParse(body.expires_in);
    if (!value.success || !expiresIn.success) throw new Error("jeton d'application illisible");
    token = { value: value.data, expiresAt: clock() + expiresIn.data * 1000 };
    return token.value;
  };

  const getStreams = async (value: string): Promise<Response> =>
    fetcher(`${STREAMS_URL}?user_id=${encodeURIComponent(channelId ?? "")}`, {
      headers: { authorization: `Bearer ${value}`, "client-id": clientId },
      signal: AbortSignal.timeout(delayMs),
    });

  return {
    async get() {
      if (channelId === undefined) return null;
      let response = await getStreams(await getToken());
      // Le jeton a été révoqué avant sa fin : on en demande un autre, une fois.
      if (response.status === 401) {
        token = null;
        response = await getStreams(await getToken());
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await getJson(response);
      const streams = z.array(ObjectSchema).safeParse(body.data);
      if (!streams.success) throw new Error("réponse illisible");
      const count = z.number().safeParse(streams.data[0]?.viewer_count);
      return count.success ? count.data : null;
    },
  };
}
