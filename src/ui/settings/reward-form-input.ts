// Ce que le formulaire d'une récompense tient en cours de saisie, et ce qu'il en fait partir : pur, sans React, pour se tester seul.

import { REWARD_DEFAULTS, type RewardCreation, type RewardSummary } from "../../domain/reward.schema";

// Un coût ou un cooldown vidé vaut `null`. `sound` : l'identifiant du sound choisi à la création, `null` : aucun.
export type Draft = { title: string; cost: number | null; pace: number | null; sound: string | null };

export const toDraft = (initial: RewardSummary | null): Draft => ({
  title: initial?.title ?? "",
  cost: initial?.cost ?? REWARD_DEFAULTS.cost,
  pace: initial?.pace ?? REWARD_DEFAULTS.pace,
  sound: null,
});

export type FormInput = { ok: true; input: RewardCreation } | { ok: false; message: string };

// Ce que le formulaire envoie au serveur, ou pourquoi il ne peut pas encore l'envoyer.
export function toInput({ title, cost, pace, sound }: Draft): FormInput {
  if (cost === null || pace === null) {
    return { ok: false, message: "le coût et le cooldown doivent être des nombres" };
  }
  return { ok: true, input: { title: title.trim(), cost, pace, sound } };
}

// Le formulaire peut partir : un titre suffit, le coût et le cooldown ont leurs valeurs par défaut.
export const isReady = (draft: Draft): boolean => draft.title.trim() !== "";
