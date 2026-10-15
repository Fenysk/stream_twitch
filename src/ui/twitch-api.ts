// Twitch côté page : la connexion et le nombre de viewers, ce que les onglets Twitch et Direct demandent au serveur. Chaque
// demande rend une réponse ou le refus à montrer, jamais une exception. Le serveur ne rend jamais le jeton : seulement l'état.

import { type TwitchStatus, TwitchStatusSchema } from "../domain/twitch.schema";
import { ViewersStateSchema } from "../domain/viewers.schema";
import type { ViewersState } from "../domain/viewers.types";
import { type Answer, ask } from "./expressions-api";

const toStatus = (body: unknown): TwitchStatus | undefined => {
  const parsed = TwitchStatusSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

const toViewersState = (body: unknown): ViewersState | undefined => {
  const parsed = ViewersStateSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

// Le nombre de viewers du live : le serveur le garde déjà, la demande ne passe pas par Twitch.
export const getViewers = (): Promise<Answer<ViewersState>> =>
  ask("/api/twitch/viewers", { method: "GET" }, toViewersState);

export const getTwitchStatus = (): Promise<Answer<TwitchStatus>> =>
  ask("/api/twitch/status", { method: "GET" }, toStatus);

// Efface le jeton et arrête d'écouter les follows.
export const disconnectTwitch = (): Promise<Answer<TwitchStatus>> =>
  ask(
    "/api/twitch/disconnect",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    toStatus,
  );
