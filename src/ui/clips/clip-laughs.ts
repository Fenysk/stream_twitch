// Les rires d'un clip pendant qu'Alexis les place : l'état de l'éditeur (une clé par rire, le rire choisi) et ce que la timeline en montre.

import type { ClipLaugh } from "../../domain/clip.schema";
import { isLaughKept, isLaughOverEnd, toLaughRank } from "../../domain/laugh.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import type { Trim } from "../../domain/trim.rules";

// Un rire de l'éditeur : sa clé reste la sienne tant qu'il glisse ou change de sound (deux rires peuvent tomber au même instant).
export type EditorLaugh = ClipLaugh & { key: number };

export type LaughsState = {
  laughs: readonly EditorLaugh[];
  // Le rire choisi, `null` : aucun.
  selectedKey: number | null;
  nextKey: number;
};

export type LaughsAction =
  | { kind: "create"; at: number; sound: string }
  | { kind: "move"; key: number; at: number }
  | { kind: "update"; key: number; sound: string }
  | { kind: "delete"; key: number }
  | { kind: "choose"; key: number };

export const createLaughsState = (laughs: readonly ClipLaugh[] = []): LaughsState => ({
  laughs: laughs.map((laugh, key) => ({ ...laugh, key })),
  selectedKey: null,
  nextKey: laughs.length,
});

// Une clé qui n'existe pas ne change rien. Une clé retirée n'est jamais rendue à un autre rire.
export const reduceLaughs = (state: LaughsState, action: LaughsAction): LaughsState => {
  switch (action.kind) {
    case "create":
      return {
        laughs: [...state.laughs, { at: action.at, sound: action.sound, key: state.nextKey }],
        selectedKey: state.nextKey,
        nextKey: state.nextKey + 1,
      };
    case "move":
      return {
        ...state,
        laughs: state.laughs.map((laugh) => (laugh.key === action.key ? { ...laugh, at: action.at } : laugh)),
      };
    case "update":
      return {
        ...state,
        laughs: state.laughs.map((laugh) =>
          laugh.key === action.key ? { ...laugh, sound: action.sound } : laugh,
        ),
      };
    case "delete":
      return {
        ...state,
        laughs: state.laughs.filter(({ key }) => key !== action.key),
        selectedKey: state.selectedKey === action.key ? null : state.selectedKey,
      };
    case "choose":
      return { ...state, selectedKey: action.key };
  }
};

// Ce qu'il faut pour montrer les rires : les sounds, la durée de ceux qu'on connaît (par identifiant), la partie gardée (en secondes du
// clip brut) et l'instant du clip brut où la vidéo lue commence.
export type LaughView = {
  sounds: readonly SoundSummary[] | null;
  seconds: ReadonlyMap<string, number>;
  kept: Trim;
  origin: number;
};

// Un bloc de la piste Rires : son instant dans la vidéo lue, le titre de son sound, la durée de son sound (`undefined` tant qu'elle n'est
// pas lue), et s'il est dans la partie gardée et choisi.
export type LaughBlock = {
  key: number;
  at: number;
  title: string;
  seconds: number | undefined;
  isKept: boolean;
  isSelected: boolean;
};

// Les blocs des rires dont on connaît le sound ; l'instant d'un bloc compte depuis le début de la vidéo lue.
export const toLaughBlocks = (
  laughs: readonly EditorLaugh[],
  selectedKey: number | null,
  { sounds, seconds, kept, origin }: LaughView,
): LaughBlock[] =>
  laughs.flatMap((laugh) => {
    const title = sounds?.find(({ id }) => id === laugh.sound)?.title;
    if (title === undefined) return [];
    return [
      {
        key: laugh.key,
        at: laugh.at - origin,
        title,
        seconds: seconds.get(laugh.sound),
        isKept: isLaughKept(laugh.at, kept),
        isSelected: laugh.key === selectedKey,
      },
    ];
  });

// Le rire choisi sous la timeline : son rang « n sur N », son instant dans la vidéo lue, son sound, et ce qui l'empêche d'être joué
// comme prévu.
export type LaughDetails = {
  key: number;
  rank: number;
  count: number;
  at: number;
  sound: string;
  isOverEnd: boolean;
  isKept: boolean;
};

// Le rang compte tous les rires donnés ; l'instant du détail compte depuis le début de la vidéo lue, la fin gardée depuis le clip brut.
export const toLaughDetails = (
  laughs: readonly EditorLaugh[],
  selectedKey: number | null,
  { seconds, kept, origin }: LaughView,
): LaughDetails | null => {
  const index = laughs.findIndex(({ key }) => key === selectedKey);
  const laugh = laughs[index];
  if (!laugh) return null;
  const length = seconds.get(laugh.sound);
  return {
    key: laugh.key,
    ...toLaughRank(
      laughs.map(({ at }) => at),
      index,
    ),
    at: laugh.at - origin,
    sound: laugh.sound,
    isOverEnd: length !== undefined && isLaughOverEnd(laugh.at, length, kept.end),
    isKept: isLaughKept(laugh.at, kept),
  };
};

// Les sounds que des rires utilisent : eux seuls ont leur durée à lire.
export const toUsedSounds = (
  laughs: readonly { sound: string }[],
  sounds: readonly SoundSummary[] | null,
): SoundSummary[] => {
  const used = new Set(laughs.map(({ sound }) => sound));
  return (sounds ?? []).filter(({ id }) => used.has(id));
};

// Ce que le serveur reçoit : l'instant et le sound de chaque rire, sans la clé de l'éditeur.
export const toLaughRequests = (laughs: readonly EditorLaugh[]): ClipLaugh[] =>
  laughs.map(({ at, sound }) => ({ at, sound }));
