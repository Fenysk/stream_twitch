import type { EmoteProvider, EmoteScope } from "../domain/emote-sync.rules";
import type { EmoteAnswer, EmotePort } from "../usecase/emote-sync.usecase";

export type EmoteClientSettings = {
  // L'identifiant numérique de la chaîne sur Twitch (7TV et BTTV le demandent) ; sans lui, ces deux services n'ont pas
  // d'emotes de chaîne à donner.
  channelId: string | undefined;
  // Le nom de la chaîne (FFZ le demande).
  login: string;
  delayMs?: number;
  // Le réseau est injecté : les tests ne l'appellent jamais.
  fetcher?: typeof fetch;
};

const DEFAULT_DELAY_MS = 10_000;

const GLOBAL_URLS: Record<EmoteProvider, string> = {
  "7tv": "https://7tv.io/v3/emote-sets/global",
  bttv: "https://api.betterttv.net/3/cached/emotes/global",
  ffz: "https://api.frankerfacez.com/v1/set/global",
};

// L'adresse des emotes d'une chaîne, ou `null` quand le service la cherche par un identifiant qu'on n'a pas.
const toChannelUrl = (
  provider: EmoteProvider,
  channelId: string | undefined,
  login: string,
): string | null => {
  if (provider === "ffz")
    return `https://api.frankerfacez.com/v1/room/${encodeURIComponent(login.toLowerCase())}`;
  if (channelId === undefined) return null;
  const id = encodeURIComponent(channelId);
  return provider === "7tv"
    ? `https://7tv.io/v3/users/twitch/${id}`
    : `https://api.betterttv.net/3/cached/users/twitch/${id}`;
};

// Les services d'emotes par HTTP. Un 404 est une réponse (la chaîne n'a pas d'emotes) ; tout autre échec lève : le réseau, un
// délai dépassé, un autre code HTTP, un corps qui n'est pas du JSON.
export function createEmoteClient({
  channelId,
  login,
  delayMs = DEFAULT_DELAY_MS,
  fetcher = fetch,
}: EmoteClientSettings): EmotePort {
  return {
    async get(provider: EmoteProvider, scope: EmoteScope): Promise<EmoteAnswer> {
      const url = scope === "global" ? GLOBAL_URLS[provider] : toChannelUrl(provider, channelId, login);
      if (url === null) return { kind: "missing" };
      const response = await fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(delayMs),
      });
      if (response.status === 404) return { kind: "missing" };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { kind: "found", json: await response.json() };
    },
  };
}
