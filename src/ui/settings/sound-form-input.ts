// Ce que le formulaire d'un sound tient en cours de saisie, et ce qu'il en fait partir : pur, sans React, pour se tester seul.

import { SOUND_DEFAULTS, type SoundInput, type SoundSummary } from "../../domain/sound.schema";

export type ChosenFile = { name: string; base64: string };

export type Draft = { title: string; fader: number; file: ChosenFile | null };

export const toDraft = (initial: SoundSummary | null): Draft => ({
  title: initial?.title ?? "",
  fader: initial?.fader ?? SOUND_DEFAULTS.fader,
  file: null,
});

// Ce que le formulaire envoie au serveur : le titre, le volume, et le fichier s'il y en a un (sans lui, le serveur garde l'ancien).
export const toInput = ({ title, fader, file }: Draft): SoundInput => ({
  title: title.trim(),
  fader,
  ...(file ? { file: file.base64 } : {}),
});

// Le formulaire peut partir : un titre, et un fichier (sauf à la modification : on garde l'ancien).
export const isReady = (draft: Draft, initial: SoundSummary | null): boolean =>
  draft.title.trim() !== "" && (initial !== null || draft.file !== null);
