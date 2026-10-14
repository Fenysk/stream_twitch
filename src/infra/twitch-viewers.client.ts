import { z } from "zod";
import type { ViewersPort } from "../usecase/viewers.usecase";
import {
  type AppTokenSettings,
  createAppToken,
  DEFAULT_DELAY_MS,
  getJsonObject,
} from "./twitch-app-token.client";

export type ViewersClientSettings = AppTokenSettings & {
  // L'identifiant Twitch de la chaîne ; sans lui, le nombre n'est jamais connu.
  channelId: string | undefined;
};

const STREAMS_URL = "https://api.twitch.tv/helix/streams";

// Le nombre de viewers du live par l'API Helix, avec un jeton d'application (« client credentials ») : il marche sans la
// connexion d'Alexis. Les messages d'erreur ne portent jamais le jeton ni le secret : seulement un code HTTP ou « illisible ».
export function createViewersClient({
  channelId,
  fetcher = fetch,
  delayMs = DEFAULT_DELAY_MS,
  ...appSettings
}: ViewersClientSettings): ViewersPort {
  const token = createAppToken({ ...appSettings, fetcher, delayMs });
  const { clientId } = appSettings;

  const getStreams = async (value: string): Promise<Response> =>
    fetcher(`${STREAMS_URL}?user_id=${encodeURIComponent(channelId ?? "")}`, {
      headers: { authorization: `Bearer ${value}`, "client-id": clientId },
      signal: AbortSignal.timeout(delayMs),
    });

  return {
    async get() {
      if (channelId === undefined) return null;
      let response = await getStreams(await token.get());
      // Le jeton a été révoqué avant sa fin : on en demande un autre, une fois.
      if (response.status === 401) {
        token.forget();
        response = await getStreams(await token.get());
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await getJsonObject(response);
      const streams = z.array(z.record(z.string(), z.unknown())).safeParse(body.data);
      if (!streams.success) throw new Error("réponse illisible");
      const count = z.number().safeParse(streams.data[0]?.viewer_count);
      return count.success ? count.data : null;
    },
  };
}
