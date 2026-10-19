// Les touches de la régie, générées toutes seules de l'état d'OBS et de la soundboard : aucun réglage. Le texte et l'état de chaque
// touche se calculent ici ; son geste (`KeyAction`) est exécuté ailleurs (use-control-actions.ts).

import { MUTE_MIC_ID, toCameraMicId, toLiveMic, toProgramScenes } from "../../domain/control.rules";
import type { ControlState } from "../../domain/control.schema";
import { END_STEP_MINUTES, type EndDirection } from "../../domain/hours.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import { isMicMuted, toMicName } from "./control-view";

export type KeyAction =
  | { kind: "scene"; name: string }
  | { kind: "sound"; id: string }
  | { kind: "mic"; id: string }
  | { kind: "picture"; id: string }
  | { kind: "review" }
  | { kind: "end"; direction: EndDirection }
  | { kind: "stop" };

// Une touche active est claire (la scène à l'antenne, le micro choisi, le plan), les autres sont neutres.
export type KeyState = "active" | "idle";

export type ControlKey = {
  id: string;
  label: string;
  // Une ligne sous le libellé : ce qui manque à une touche grisée.
  note?: string;
  state: KeyState;
  isDisabled: boolean;
  action: KeyAction;
};

// Les touches de la feuille Antenne (pas de la grille) : une par scène d'OBS, sauf celles de Master, la scène à l'antenne active.
export const toSceneKeys = ({ scenes, scene }: ControlState): ControlKey[] =>
  toProgramScenes(scenes).map((name) => ({
    id: `scene:${name}`,
    label: name,
    state: name === scene ? "active" : "idle",
    isDisabled: false,
    action: { kind: "scene", name },
  }));

// Les touches de la grille : une par son de la soundboard ; `sounds` à `null` : la liste n'est pas encore là.
export const toSoundKeys = (sounds: readonly SoundSummary[] | null): ControlKey[] =>
  (sounds ?? []).map(({ id, title }) => ({
    id: `sound:${id}`,
    label: title,
    state: "idle",
    isDisabled: false,
    action: { kind: "sound", id },
  }));

// Les touches du menu Micro (pas de la grille) : PC, puis chaque caméra connectée (« · ce téléphone » pour celle de ce téléphone,
// `ownNumber`). Le micro choisi est clair, les autres neutres, aucun quand tout est coupé ; celui dont la source OBS manque est grisé,
// avec ce qui lui manque. Sans micro connu (le serveur n'a rien dit), aucune touche. Muet n'est pas dans la liste : `toMuteKey`.
export const toMicKeys = (state: ControlState, ownNumber: number | null = null): ControlKey[] => {
  const { mics } = state;
  const live = toLiveMic(mics);
  const ownMicId = ownNumber === null ? null : toCameraMicId(ownNumber);
  return mics.map((mic) => ({
    id: `mic:${mic.id}`,
    label: mic.id === ownMicId ? `${toMicName(mic)} · ce téléphone` : toMicName(mic),
    ...(mic.isAvailable ? {} : { note: "Source OBS introuvable" }),
    state: mic.id === live?.id ? "active" : "idle",
    isDisabled: !mic.isAvailable,
    action: { kind: "mic", id: mic.id },
  }));
};

// La touche à part du menu Micro, sous la liste : « Couper le micro » quand un micro est ouvert, « Micro coupé » (enfoncée) quand OBS est
// joint et qu'aucun n'est ouvert. Même geste que le choix d'un micro, avec l'identifiant réservé de Muet : choisir un micro rallume.
export const toMuteKey = (state: ControlState): ControlKey => {
  const isMuted = isMicMuted(state);
  return {
    id: `mic:${MUTE_MIC_ID}`,
    label: isMuted ? "Micro coupé" : "Couper le micro",
    state: isMuted ? "active" : "idle",
    isDisabled: false,
    action: { kind: "mic", id: MUTE_MIC_ID },
  };
};

// Les touches du plan, dans la feuille Antenne (pas de la grille) : PC, chaque caméra, puis Tête, dans l'ordre de la place. Le membre au plan est
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

// Les trois touches de Jean-Renard de la feuille Live : la fin du live dix minutes plus tôt ou plus tard (la fin prévue s'écrit à côté,
// `toEndText`), puis le bilan.
export const toFoxKeys = (): ControlKey[] => [
  {
    id: "fox:sooner",
    label: `−${END_STEP_MINUTES} min`,
    state: "idle",
    isDisabled: false,
    action: { kind: "end", direction: "sooner" },
  },
  {
    id: "fox:later",
    label: `+${END_STEP_MINUTES} min`,
    state: "idle",
    isDisabled: false,
    action: { kind: "end", direction: "later" },
  },
  {
    id: "fox:review",
    label: "Bilan",
    state: "idle",
    isDisabled: false,
    action: { kind: "review" },
  },
];

// Ce que la grille dit à la place des touches quand elle n'en a aucune.
export const toSoundsEmptyText = (sounds: readonly SoundSummary[] | null): string =>
  sounds === null ? "Chargement…" : "Aucun son : ajoute-en dans l'onglet Sons.";

// Ce que le menu des micros dit à la place des touches : le serveur n'a pas encore donné l'état de la régie, qui a toujours le micro du PC.
export const toMicsEmptyText = (): string => "En attente du serveur…";

// Ce que la section Plan de la feuille Antenne dit à la place des touches : OBS n'est pas joint, ou n'a pas de place caméra.
export const toPictureEmptyText = ({ isLinked }: ControlState): string =>
  isLinked ? "OBS n'a pas de place caméra : vérifie cameraSlotScene." : "OBS n'est pas connecté.";

// Ce que la section Scène de la feuille Antenne dit à la place des touches : OBS n'a aucune scène à passer à l'antenne, ou n'est pas joint
// (rien à choisir : seule l'alerte dit « OBS non joint »).
export const toScenesEmptyText = ({ isLinked }: ControlState): string =>
  isLinked ? "Aucune scène dans OBS." : "Aucune scène à choisir.";

// Un refus du serveur commence par une minuscule (« la scène … ») : sur le téléphone, il s'écrit comme une phrase.
export const toSentence = (message: string): string =>
  message === "" ? message : `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
