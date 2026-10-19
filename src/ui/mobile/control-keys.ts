// Les touches de la grille de la régie, générées toutes seules de l'état d'OBS et de la soundboard : aucun réglage. Le texte et l'état
// de chaque touche se calculent ici ; son geste (`KeyAction`) est exécuté ailleurs (use-control-actions.ts).

import { MUTE_MIC_ID, toCameraMicId, toLiveMic, toProgramScenes } from "../../domain/control.rules";
import type { ControlPage, ControlState } from "../../domain/control.schema";
import { END_STEP_MINUTES, type EndDirection, toEndClock } from "../../domain/hours.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import { isMicMuted, MUTE_TEXT, toMicName } from "./control-view";

export type KeyAction =
  | { kind: "scene"; name: string }
  | { kind: "sound"; id: string }
  | { kind: "mic"; id: string }
  | { kind: "picture"; id: string }
  | { kind: "review" }
  | { kind: "end"; direction: EndDirection };

// Une touche active est claire (la scène à l'antenne, le micro choisi, le plan), les autres sont neutres.
export type KeyState = "active" | "idle";

export type ControlKey = {
  id: string;
  label: string;
  // Une ligne sous le libellé : la fin prévue du live, ou ce qui manque à une touche grisée.
  note?: string;
  state: KeyState;
  isDisabled: boolean;
  action: KeyAction;
};

const NO_END_CLOCK = "--:--";

// Les touches du menu des scènes (pas une page de la grille) : une par scène d'OBS, sauf celles de Master, la scène à l'antenne active.
export const toSceneKeys = ({ scenes, scene }: ControlState): ControlKey[] =>
  toProgramScenes(scenes).map((name) => ({
    id: `scene:${name}`,
    label: name,
    state: name === scene ? "active" : "idle",
    isDisabled: false,
    action: { kind: "scene", name },
  }));

const toSoundKeys = (sounds: readonly SoundSummary[] | null): ControlKey[] =>
  (sounds ?? []).map(({ id, title }) => ({
    id: `sound:${id}`,
    label: title,
    state: "idle",
    isDisabled: false,
    action: { kind: "sound", id },
  }));

// Les touches du menu Micro (pas une page de la grille) : PC, chaque caméra connectée (« · ce téléphone » pour celle de ce téléphone,
// `ownNumber`), puis Muet. Le micro choisi est clair, Muet quand aucun n'est ouvert, les autres neutres ; celui dont la source OBS manque est
// grisé, avec ce qui lui manque. Sans micro connu (le serveur n'a rien dit), aucune touche : pas même Muet.
export const toMicKeys = (state: ControlState, ownNumber: number | null = null): ControlKey[] => {
  const { mics } = state;
  if (mics.length === 0) return [];
  const live = toLiveMic(mics);
  const ownMicId = ownNumber === null ? null : toCameraMicId(ownNumber);
  const keys: ControlKey[] = mics.map((mic) => ({
    id: `mic:${mic.id}`,
    label: mic.id === ownMicId ? `${toMicName(mic)} · ce téléphone` : toMicName(mic),
    ...(mic.isAvailable ? {} : { note: "Source OBS introuvable" }),
    state: mic.id === live?.id ? "active" : "idle",
    isDisabled: !mic.isAvailable,
    action: { kind: "mic", id: mic.id },
  }));
  return [
    ...keys,
    {
      id: `mic:${MUTE_MIC_ID}`,
      label: MUTE_TEXT,
      state: isMicMuted(state) ? "active" : "idle",
      isDisabled: false,
      action: { kind: "mic", id: MUTE_MIC_ID },
    },
  ];
};

// Les touches du menu Plan (pas une page de la grille) : PC, chaque caméra, puis Tête, dans l'ordre de la place. Le membre au plan est
// clair, les autres neutres ; une caméra dont le téléphone ne filme pas vers OBS est grisée, avec ce qui lui manque.
export const toPictureKeys = ({ picture }: ControlState): ControlKey[] =>
  picture.members.map(({ id, label, isAvailable }) => ({
    id: `picture:${id}`,
    label,
    ...(isAvailable ? {} : { note: "Le téléphone ne filme pas vers OBS" }),
    state: id === picture.currentId ? "active" : "idle",
    isDisabled: !isAvailable,
    action: { kind: "picture", id },
  }));

// Trois touches fixes : le bilan, et la fin du live dix minutes plus tôt ou plus tard (avec la fin prévue en dessous, comme le
// Stream Deck).
const toFoxKeys = ({ endAt }: ControlState): ControlKey[] => {
  const note = toEndClock(endAt) || NO_END_CLOCK;
  return [
    {
      id: "fox:review",
      label: "Faire le bilan",
      state: "idle",
      isDisabled: false,
      action: { kind: "review" },
    },
    {
      id: "fox:sooner",
      label: `Fin du live −${END_STEP_MINUTES}`,
      note,
      state: "idle",
      isDisabled: false,
      action: { kind: "end", direction: "sooner" },
    },
    {
      id: "fox:later",
      label: `Fin du live +${END_STEP_MINUTES}`,
      note,
      state: "idle",
      isDisabled: false,
      action: { kind: "end", direction: "later" },
    },
  ];
};

// Les touches d'une page de la grille ; `sounds` à `null` : la liste des sounds n'est pas encore là.
export const toKeys = (
  page: ControlPage,
  state: ControlState,
  sounds: readonly SoundSummary[] | null,
): ControlKey[] => {
  switch (page) {
    case "sounds":
      return toSoundKeys(sounds);
    case "fox":
      return toFoxKeys(state);
  }
};

// Ce qu'une page sans touche dit à la place.
export const toEmptyText = (page: ControlPage, sounds: readonly SoundSummary[] | null): string => {
  if (page === "sounds") return sounds === null ? "Chargement…" : "Aucun son : ajoute-en dans l'onglet Sons.";
  return "";
};

// Ce que le menu des micros dit à la place des touches : le serveur n'a pas encore donné l'état de la régie, qui a toujours le micro du PC.
export const toMicsEmptyText = (): string => "En attente du serveur…";

// Ce que le menu de l'image dit à la place des touches : OBS n'est pas joint, ou n'a pas de place caméra.
export const toPictureEmptyText = ({ isLinked }: ControlState): string =>
  isLinked ? "OBS n'a pas de place caméra : vérifie cameraSlotScene." : "OBS n'est pas connecté.";

// Ce que le menu des scènes dit à la place des touches : OBS n'est pas joint, ou n'a aucune scène à passer à l'antenne.
export const toScenesEmptyText = ({ isLinked }: ControlState): string =>
  isLinked ? "Aucune scène dans OBS." : "OBS n'est pas connecté.";

// Un refus du serveur commence par une minuscule (« la scène … ») : sur le téléphone, il s'écrit comme une phrase.
export const toSentence = (message: string): string =>
  message === "" ? message : `${message.charAt(0).toUpperCase()}${message.slice(1)}`;

export const PAGE_LABELS: Record<ControlPage, string> = {
  sounds: "Sons",
  fox: "Jean-Renard",
};
