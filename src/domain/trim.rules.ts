// La partie d'un clip qu'Alexis garde, en secondes. Un clip d'OBS tourne à 60 i/s : une image dure 1/60 s, et le début, la fin
// et les déplacements image par image se calent sur elle.
export const STEP_SECONDS = 1 / 60;

export type Trim = { start: number; end: number };

// Un flottant comme 3 × (1/60) tombe juste sous 3/60 : sans cette marge, l'image 3 passerait pour la 2.
const EPSILON = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

// Le numéro de l'image affichée à `time`.
export const toStepIndex = (time: number): number => Math.floor(time / STEP_SECONDS + EPSILON);

// Le début de l'image affichée à `time` : un début gardé la contient.
export const toStepStart = (time: number): number => toStepIndex(time) * STEP_SECONDS;

// La fin de l'image affichée à `time` : une fin gardée la contient, l'image qu'on voit est la dernière gardée.
export const toStepEnd = (time: number): number => (toStepIndex(time) + 1) * STEP_SECONDS;

// Le milieu de l'image `index` : l'instant où se placer pour qu'elle s'affiche (le navigateur prendrait l'image d'avant à
// la frontière).
export const toStepMiddle = (index: number): number => (index + 0.5) * STEP_SECONDS;

const toLastStepIndex = (duration: number): number =>
  Math.max(0, Math.ceil(duration / STEP_SECONDS - EPSILON) - 1);

// L'instant de l'image `steps` images plus loin (ou plus tôt) que celle de `time`, sans sortir du clip.
export const toSteppedTime = (time: number, steps: number, duration: number): number =>
  toStepMiddle(clamp(toStepIndex(time) + steps, 0, toLastStepIndex(duration)));

// Le début à `time`, une image au moins avant la fin.
export const toStartAt = (trim: Trim, time: number): Trim => ({
  start: clamp(time, 0, Math.max(0, trim.end - STEP_SECONDS)),
  end: trim.end,
});

// La fin à `time`, une image au moins après le début, jamais au-delà du clip.
export const toEndAt = (trim: Trim, time: number, duration: number): Trim => ({
  start: trim.start,
  end: Math.min(duration, Math.max(time, trim.start + STEP_SECONDS)),
});

// Les raccourcis sous le lecteur : I pose le début et O la fin à la position de lecture, R un rire à la position de lecture, Suppr
// retire le rire choisi, les flèches avancent d'une image, Espace lit ou arrête. Ils ne valent que hors d'un champ de saisie.
export type ClipKey = "start" | "end" | "laugh" | "delete" | "back" | "forward" | "toggle";

const CLIP_KEYS = new Map<string, ClipKey>([
  ["i", "start"],
  ["o", "end"],
  ["r", "laugh"],
  ["Delete", "delete"],
  ["ArrowLeft", "back"],
  ["ArrowRight", "forward"],
  [" ", "toggle"],
]);

export const toClipKey = (key: string): ClipKey | undefined =>
  CLIP_KEYS.get(key.length === 1 ? key.toLowerCase() : key);

// Une position sur la barre (de 0 à 1) en instant du clip.
export const toTimeAt = (fraction: number, duration: number): number => clamp(fraction, 0, 1) * duration;

// Un instant du clip en position sur la barre (de 0 à 1) ; une durée inconnue ou nulle donne 0.
export const toFraction = (time: number, duration: number): number =>
  duration > 0 ? clamp(time / duration, 0, 1) : 0;

// L'instant le plus proche du début d'une image : où les poignées se posent.
export const toNearestStep = (time: number): number => Math.round(time / STEP_SECONDS) * STEP_SECONDS;
