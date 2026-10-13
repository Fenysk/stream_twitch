// La connexion à Twitch côté page : ce que l'onglet Renard demande au serveur. Chaque demande rend une réponse ou le refus à
// montrer, jamais une exception. Le serveur ne rend jamais le jeton : seulement l'état.

import { type TwitchStatus, TwitchStatusSchema } from "../domain/twitch.schema";
import { type Answer, ask } from "./expressions-api";

const toStatus = (body: unknown): TwitchStatus | undefined => {
  const parsed = TwitchStatusSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

export const getTwitchStatus = (): Promise<Answer<TwitchStatus>> =>
  ask("/api/twitch/status", { method: "GET" }, toStatus);

// Efface le jeton et arrête d'écouter les follows.
export const disconnectTwitch = (): Promise<Answer<TwitchStatus>> =>
  ask(
    "/api/twitch/disconnect",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    toStatus,
  );
