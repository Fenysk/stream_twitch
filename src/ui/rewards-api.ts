// Les récompenses de la chaîne côté page : ce que l'interface demande au serveur. Chaque demande rend une réponse ou le refus à
// montrer, jamais une exception. Les refus du serveur sont déjà en français, on les affiche tels quels.

import {
  type RewardCreation,
  RewardListSchema,
  RewardSoundInputSchema,
  type RewardSummary,
  RewardSummarySchema,
} from "../domain/reward.schema";
import type { RewardFields } from "../domain/reward.types";
import { type Answer, ask } from "./expressions-api";

const JSON_HEADERS = { "content-type": "application/json" };

const asJson = (method: "POST" | "PUT", body: RewardCreation | RewardFields | { sound: string | null }) => ({
  method,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

const toSummary = (body: unknown): RewardSummary | undefined => {
  const summary = RewardSummarySchema.safeParse(body);
  return summary.success ? summary.data : undefined;
};

// Les récompenses de la chaîne avec leur sound, puis celles que Twitch ne connaît plus.
export const listRewards = (): Promise<Answer<RewardSummary[]>> =>
  ask("/api/rewards", { method: "GET" }, (body) => {
    const list = RewardListSchema.safeParse(body);
    return list.success ? list.data.rewards : undefined;
  });

// Crée une récompense sur Twitch, avec son sound facultatif.
export const createReward = (input: RewardCreation): Promise<Answer<RewardSummary>> =>
  ask("/api/rewards", asJson("POST", input), toSummary);

// Modifie le titre, le coût et la pace d'une récompense que l'app a créée.
export const updateReward = (id: string, fields: RewardFields): Promise<Answer<RewardSummary>> =>
  ask(`/api/rewards/${encodeURIComponent(id)}`, asJson("PUT", fields), toSummary);

// Supprime une récompense que l'app a créée : Twitch la supprime aussi.
export const deleteReward = (id: string): Promise<Answer<string>> =>
  ask(`/api/rewards/${encodeURIComponent(id)}`, { method: "DELETE" }, () => id);

// Choisit le sound d'une récompense (`null` : aucun) ; rend celui que le serveur a gardé. Rien n'est écrit sur Twitch.
export const updateRewardSound = (id: string, sound: string | null): Promise<Answer<string | null>> =>
  ask(`/api/rewards/${encodeURIComponent(id)}/sound`, asJson("PUT", { sound }), (body) => {
    const saved = RewardSoundInputSchema.safeParse(body);
    return saved.success ? saved.data.sound : undefined;
  });
