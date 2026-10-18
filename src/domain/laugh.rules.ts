// Les rires d'un clip : un sound de la soundboard posé à un instant du clip brut (`ClipLaugh`, en secondes comme `start` et `end`).

import { type Trim, toNearestStep } from "./trim.rules";

// Un flottant comme 8 + 1e-7 reste dans la partie gardée.
const EPSILON = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

// L'instant d'un rire posé ou glissé : calé sur le début de l'image la plus proche, sans sortir de la partie gardée.
export const toLaughAt = (time: number, { start, end }: Trim): number =>
  clamp(toNearestStep(time), start, end);

// Un rire est joué s'il tombe dans la partie gardée, bords compris : un rire à `end` part quand la vidéo finit.
export const isLaughKept = (at: number, { start, end }: Trim): boolean =>
  at >= start - EPSILON && at <= end + EPSILON;

// Le sound du rire finit après la fin de la vidéo : la dernière image attend.
export const isLaughOverEnd = (at: number, seconds: number, end: number): boolean => at + seconds > end;

// « n sur N » : le rang du rire `index` par instant croissant (à instant égal, l'ordre de la liste) et le nombre de rires.
export type LaughRank = { rank: number; count: number };

export const toLaughRank = (ats: readonly number[], index: number): LaughRank => {
  const at = ats[index];
  if (at === undefined) return { rank: 0, count: ats.length };
  const before = ats.filter((other, position) => other < at || (other === at && position < index)).length;
  return { rank: before + 1, count: ats.length };
};

// Le sound d'un rire qu'on pose : le dernier choisi s'il est encore dans la soundboard, sinon le premier par ordre alphabétique de
// titre ; rien tant que la soundboard n'est pas lue ou quand elle est vide.
export const toDefaultSound = (
  sounds: readonly { id: string; title: string }[] | null,
  last: string | null,
): string | undefined => {
  if (sounds === null) return undefined;
  if (last !== null && sounds.some(({ id }) => id === last)) return last;
  return [...sounds].sort((a, b) => a.title.localeCompare(b.title))[0]?.id;
};

// Les rires dont le sound est dans la soundboard ; tant qu'elle n'est pas lue (`null`), tous : on ne sait pas encore ce qui existe.
export const toKnownLaughs = <Laugh extends { sound: string }>(
  laughs: readonly Laugh[],
  sounds: readonly { id: string }[] | null,
): Laugh[] => {
  if (sounds === null) return [...laughs];
  const ids = new Set(sounds.map(({ id }) => id));
  return laughs.filter(({ sound }) => ids.has(sound));
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Le JSON d'un clip confirmé d'avant les rires placés : son `laugh` (un sound joué à la fin du clip) se lit comme un rire posé à
// `end`, et disparaît. Un JSON qui a déjà `laughs` garde les siens.
export const toLaughsJson = (json: unknown): unknown => {
  if (!isRecord(json) || !("laugh" in json)) return json;
  const { laugh, ...current } = json;
  if ("laughs" in current) return current;
  const sound = typeof laugh === "string" ? laugh.trim() : "";
  const { end } = current;
  return sound === "" || typeof end !== "number" ? current : { ...current, laughs: [{ at: end, sound }] };
};

// Le volume des rires d'un clip, de 0 à 100 % (absent : 100, le son de la soundboard tel quel).
export const DEFAULT_LAUGH_FADER = 100;

export const isLaughFader = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 100;

// La force à laquelle un rire joue : le fader de son sound (la base entre les sounds) fois le volume des rires du clip.
export const toLaughFader = (soundFader: number, laughFader: number | undefined): number =>
  (soundFader * (laughFader ?? DEFAULT_LAUGH_FADER)) / 100;
