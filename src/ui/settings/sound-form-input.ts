// Ce que le formulaire d'un son tient en cours de saisie, et ce qu'il en fait partir : pur, sans React, pour se tester seul.

import {
  type RewardChoice,
  SOUND_DEFAULTS,
  type SoundInput,
  type SoundSummary,
} from "../../domain/sound.schema";

export type ChosenFile = { name: string; base64: string };

// `new` : une récompense que l'application crée sur Twitch ; `existing` : une récompense déjà faite sur Twitch, dont le titre,
// le coût et le cooldown sont ceux de Twitch.
export type RewardSource = "new" | "existing";

// Un coût ou un cooldown vidé vaut `null`. `rewardId` : la récompense de Twitch choisie (source `existing`).
export type Draft = {
  source: RewardSource;
  rewardId: string | null;
  title: string;
  cost: number | null;
  pace: number | null;
  fader: number;
  file: ChosenFile | null;
};

export const toDraft = (initial: SoundSummary | null): Draft => ({
  source: "new",
  rewardId: null,
  title: initial?.title ?? "",
  cost: initial?.cost ?? SOUND_DEFAULTS.cost,
  pace: initial?.pace ?? SOUND_DEFAULTS.pace,
  fader: initial?.fader ?? SOUND_DEFAULTS.fader,
  file: null,
});

export type FormInput = { ok: true; input: SoundInput } | { ok: false; message: string };

// Ce que le formulaire envoie au serveur, ou pourquoi il ne peut pas encore l'envoyer. Une récompense existante envoie les
// valeurs de Twitch avec son identifiant : le serveur les relit lui-même sur Twitch.
export function toInput(draft: Draft, choices: readonly RewardChoice[] | null): FormInput {
  const file = draft.file ? { file: draft.file.base64 } : {};
  if (draft.source === "existing") {
    const choice = choices?.find(({ id }) => id === draft.rewardId);
    if (!choice) return { ok: false, message: "choisis une récompense de Twitch" };
    const { title, cost, pace } = choice;
    return { ok: true, input: { title, cost, pace, fader: draft.fader, rewardId: choice.id, ...file } };
  }
  const { title, cost, pace, fader } = draft;
  if (cost === null || pace === null) {
    return { ok: false, message: "le coût et le cooldown doivent être des nombres" };
  }
  return { ok: true, input: { title, cost, pace, fader, ...file } };
}

// Le formulaire peut partir : un titre (récompense neuve), ou une récompense choisie, et un fichier (sauf à la modification :
// on garde l'ancien).
export const isReady = (draft: Draft, initial: SoundSummary | null): boolean => {
  const hasFile = initial !== null || draft.file !== null;
  return draft.source === "existing"
    ? draft.rewardId !== null && draft.file !== null
    : draft.title.trim() !== "" && hasFile;
};
