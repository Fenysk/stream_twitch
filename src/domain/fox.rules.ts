import type { FoxImage, FoxMode, FoxPlace, FoxRules } from "./fox.schema";
import { IDLE_MODE, isSameMode } from "./fox-mode.rules";
import type { Settings } from "./settings.schema";

// Les trois regards du repos, et l'image des yeux fermés (le clignement).
export const GAZE_IMAGES = ["left-closed-rest", "right-closed-rest", "front-closed-rest"] as const;
export type GazeImage = (typeof GAZE_IMAGES)[number];
export const BLINK_IMAGE = "shut-closed-rest" satisfies FoxImage;

// Quand il écoute Alexis : jamais à gauche (la gauche, c'est le tchat, il aurait l'air de lire).
export const LISTEN_IMAGES = [
  "front-closed-rest",
  "right-closed-rest",
] as const satisfies readonly GazeImage[];
export const YAWN_IMAGE = "shut-yawn-cover" satisfies FoxImage;
// Le coucou alterne ces deux images toutes les 250 ms.
export const WAVE_IMAGES = ["front-smile-wave", "front-small-wave"] as const satisfies readonly FoxImage[];
export const WAVE_PERIOD_MS = 250;

// La bouche pendant la parole : toujours le regard à gauche, du côté du museau.
export const MOUTH_IMAGES = {
  closed: "left-closed-rest",
  small: "left-small-rest",
  medium: "left-medium-rest",
  large: "left-large-rest",
} as const satisfies Record<string, FoxImage>;
export type MouthImage = (typeof MOUTH_IMAGES)[keyof typeof MOUTH_IMAGES];

// Tout ce que le renard retient d'un pas à l'autre : le regard et l'instant où il change, le clignement (prévu, ou en
// cours jusqu'à `blinkEndsAt`), la dernière bouche (la grande bouche se tire une fois par syllabe), le rebond lissé
// (-1 écrasé, +1 étiré), l'instant où la bouche a changé, s'il parle, le mode que le serveur lui donne (et depuis quand),
// s'il écoute (le regard change alors d'intervalle), et l'instant du dernier pas.
export type FoxState = {
  gaze: GazeImage;
  gazeAt: number | null;
  blinkAt: number | null;
  blinkEndsAt: number | null;
  mouth: MouthImage;
  mouthAt: number | null;
  bounce: number;
  isSpeaking: boolean;
  mode: FoxMode;
  modeAt: number | null;
  isListening: boolean;
  at: number | null;
};

export const FOX_START: FoxState = {
  gaze: "front-closed-rest",
  gazeAt: null,
  blinkAt: null,
  blinkEndsAt: null,
  mouth: MOUTH_IMAGES.closed,
  mouthAt: null,
  bounce: 0,
  isSpeaking: false,
  mode: IDLE_MODE,
  modeAt: null,
  isListening: false,
  at: null,
};

export type MouthInput = { previous: MouthImage; level: number; rules: FoxRules; random: () => number };

export type NextFoxInput = {
  previous: FoxState;
  now: number;
  // Le level de la voix en dB ; `null` quand il ne parle pas.
  level: number | null;
  rules: FoxRules;
  random: () => number;
  // Ce que le serveur lui fait montrer en plus de la bouche ; au repos sans précision.
  mode?: FoxMode;
};

// Ce que la page affiche : l'image, et l'échelle du corps (ancré aux pieds).
export type FoxDisplay = { image: FoxImage; scaleX: number; scaleY: number };

// Sans les réglages fox*, pas de règles : le renard ne s'anime pas.
export function toFoxRules(settings: Settings): FoxRules | undefined {
  const {
    foxSmallThreshold,
    foxMediumThreshold,
    foxLargeChance,
    foxBounce,
    foxBreathPeriod,
    foxBreath,
    foxGazeMin,
    foxGazeMax,
    foxBlinkMin,
    foxBlinkMax,
    foxBlinkDuration,
    foxListenMin,
    foxListenMax,
    foxJoyDuration,
    foxCrouchDuration,
    foxJumpDuration,
    foxDiveDuration,
    foxReturnDuration,
  } = settings;
  if (
    foxSmallThreshold === undefined ||
    foxMediumThreshold === undefined ||
    foxLargeChance === undefined ||
    foxBounce === undefined ||
    foxBreathPeriod === undefined ||
    foxBreath === undefined ||
    foxGazeMin === undefined ||
    foxGazeMax === undefined ||
    foxBlinkMin === undefined ||
    foxBlinkMax === undefined ||
    foxBlinkDuration === undefined ||
    foxListenMin === undefined ||
    foxListenMax === undefined ||
    foxJoyDuration === undefined ||
    foxCrouchDuration === undefined ||
    foxJumpDuration === undefined ||
    foxDiveDuration === undefined ||
    foxReturnDuration === undefined
  )
    return undefined;
  return {
    smallThreshold: foxSmallThreshold,
    mediumThreshold: foxMediumThreshold,
    largeChance: foxLargeChance,
    bounce: foxBounce,
    breathPeriod: foxBreathPeriod,
    breath: foxBreath,
    gazeMin: foxGazeMin,
    gazeMax: foxGazeMax,
    blinkMin: foxBlinkMin,
    blinkMax: foxBlinkMax,
    blinkDuration: foxBlinkDuration,
    listenMin: foxListenMin,
    listenMax: foxListenMax,
    joyMs: foxJoyDuration,
    crouchMs: foxCrouchDuration,
    jumpMs: foxJumpDuration,
    diveMs: foxDiveDuration,
    returnMs: foxReturnDuration,
  };
}

// Une seule page fait entendre la voix : quand au moins une page `/fox` est connectée (OBS), l'aperçu anime la bouche au
// même volume, sans son. La page `/fox` parle toujours ; sans elle, l'aperçu parle.
export const isFoxMuted = ({ place, screens }: { place: FoxPlace; screens: number }): boolean =>
  place === "preview" && screens > 0;

// La valeur efficace d'un bloc d'échantillons (-1 à 1) : le level de la voix s'en déduit par toLevel (mic.rules.ts).
export function toRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

// « Au-dessus » d'un seuil : strictement, comme le threshold de la tête. La moyenne ou la grande, c'est un tirage fait une
// fois à l'entrée dans la zone forte : la bouche déjà ouverte le reste, sinon elle changerait à chaque image.
export function toMouthImage({ previous, level, rules, random }: MouthInput): MouthImage {
  if (level <= rules.smallThreshold) return MOUTH_IMAGES.closed;
  if (level <= rules.mediumThreshold) return MOUTH_IMAGES.small;
  if (previous === MOUTH_IMAGES.medium || previous === MOUTH_IMAGES.large) return previous;
  return random() < rules.largeChance ? MOUTH_IMAGES.large : MOUTH_IMAGES.medium;
}

const toDuration = (min: number, max: number, random: () => number): number => min + random() * (max - min);

// Jamais le même que le précédent ; l'indice est borné au cas où le hasard rendrait 1.
const pickOther = <Item>(previous: Item, items: readonly Item[], random: () => number): Item => {
  const others = items.filter((item) => item !== previous);
  const pool = others.length > 0 ? others : items;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? previous;
};

// Une bouche reste au moins 60 ms : le level change à chaque image, et la bouche vibrerait. À l'entrée en parole, aucune attente.
const MOUTH_HOLD_MS = 60;

type MouthState = Pick<FoxState, "mouth" | "mouthAt">;

const toNextMouth = (
  previous: FoxState,
  level: number | null,
  { now, rules, random }: Timing,
): MouthState => {
  if (level === null) return { mouth: MOUTH_IMAGES.closed, mouthAt: null };
  const wanted = toMouthImage({ previous: previous.mouth, level, rules, random });
  const isHeld = previous.mouthAt !== null && now - previous.mouthAt < MOUTH_HOLD_MS;
  if (wanted === previous.mouth || isHeld) return { mouth: previous.mouth, mouthAt: previous.mouthAt };
  return { mouth: wanted, mouthAt: now };
};

// `isBusy` : il parle, ou le serveur lui fait montrer une réaction, un coucou ou un bâillement.
type Timing = {
  isBusy: boolean;
  isListening: boolean;
  now: number;
  rules: FoxRules;
  random: () => number;
};

type GazeState = Pick<FoxState, "gaze" | "gazeAt">;

// Le regard ne change pas quand il est occupé ; en repartant, il reprend un intervalle entier. Quand il écoute, il alterne
// entre face et droite à son propre intervalle, et ne reste jamais à gauche : en entrant dans l'écoute, il se tourne tout
// de suite.
const toNextGaze = (
  { gaze, gazeAt, isListening: wasListening }: GazeState & { isListening: boolean },
  { isBusy, isListening, now, rules, random }: Timing,
): GazeState => {
  if (isBusy) return { gaze, gazeAt: null };
  const pool: readonly GazeImage[] = isListening ? LISTEN_IMAGES : GAZE_IMAGES;
  const [min, max] = isListening ? [rules.listenMin, rules.listenMax] : [rules.gazeMin, rules.gazeMax];
  const current = pool.includes(gaze) ? gaze : (pool[0] ?? gaze);
  const planned = wasListening === isListening && current === gaze ? gazeAt : null;
  if (planned === null) return { gaze: current, gazeAt: now + toDuration(min, max, random) };
  if (now < planned) return { gaze: current, gazeAt: planned };
  return { gaze: pickOther(current, pool, random), gazeAt: now + toDuration(min, max, random) };
};

type BlinkState = Pick<FoxState, "blinkAt" | "blinkEndsAt">;

// Jamais pendant qu'il parle ni pendant une réaction, un coucou ou un bâillement : le clignement prévu ou en cours est
// abandonné, le suivant se tire après. Il cligne en écoutant.
const toNextBlink = (
  { blinkAt, blinkEndsAt }: BlinkState,
  { isBusy, now, rules, random }: Timing,
): BlinkState => {
  const nextAt = now + toDuration(rules.blinkMin, rules.blinkMax, random);
  if (isBusy) return { blinkAt: null, blinkEndsAt: null };
  if (blinkEndsAt !== null) {
    return now < blinkEndsAt ? { blinkAt, blinkEndsAt } : { blinkAt: nextAt, blinkEndsAt: null };
  }
  if (blinkAt === null) return { blinkAt: nextAt, blinkEndsAt: null };
  return now < blinkAt ? { blinkAt, blinkEndsAt } : { blinkAt: null, blinkEndsAt: now + rules.blinkDuration };
};

// Le rebond cherché : -1 sous le premier seuil (écrasé), +1 au second et au-dessus (étiré), linéaire entre les deux.
const toBounceTarget = (level: number | null, rules: FoxRules): number => {
  if (level === null) return 0;
  const span = rules.mediumThreshold - rules.smallThreshold;
  const position = span > 0 ? Math.min(1, Math.max(0, (level - rules.smallThreshold) / span)) : 0;
  return position * 2 - 1;
};

// Le corps a de l'inertie : il rejoint le rebond cherché en quelques dizaines de ms, au lieu de sauter à chaque image.
const BOUNCE_SMOOTHING_MS = 60;
// Un pas plus long (page cachée puis revenue) compte pour 100 ms : le corps ne bondit pas d'un coup.
const MAX_STEP_MS = 100;

const toSmoothed = (current: number, target: number, elapsed: number): number =>
  current + (target - current) * (1 - Math.exp(-Math.min(elapsed, MAX_STEP_MS) / BOUNCE_SMOOTHING_MS));

const isShowing = ({ kind }: FoxMode): boolean =>
  kind === "reaction" || kind === "wave" || kind === "yawn" || kind === "address" || kind === "joy";

// Un pas de l'animation : la page l'appelle à chaque image, avec le level de la voix (null : il ne parle pas) et le mode
// que le serveur lui donne.
export function toNextFox({ previous, now, level, rules, random, mode = IDLE_MODE }: NextFoxInput): FoxState {
  const isSpeaking = level !== null;
  const isBusy = isSpeaking || isShowing(mode);
  const isListening = !isBusy && mode.kind === "listening";
  const timing: Timing = { isBusy, isListening, now, rules, random };
  return {
    ...toNextGaze(previous, timing),
    ...toNextBlink(previous, timing),
    ...toNextMouth(previous, level, timing),
    bounce: toSmoothed(
      previous.bounce,
      toBounceTarget(level, rules),
      previous.at === null ? 0 : now - previous.at,
    ),
    isSpeaking,
    mode,
    modeAt: isSameMode(previous.mode, mode) ? previous.modeAt : now,
    isListening,
    at: now,
  };
}

const toModeImage = ({ mode, modeAt }: FoxState, now: number): FoxImage | null => {
  switch (mode.kind) {
    case "reaction":
      return mode.image;
    case "yawn":
      return YAWN_IMAGE;
    case "wave":
      return Math.floor((now - (modeAt ?? now)) / WAVE_PERIOD_MS) % 2 === 0 ? WAVE_IMAGES[0] : WAVE_IMAGES[1];
    // Le regard à gauche, qu'on retourne : il regarde Fenysk, à droite.
    case "address":
      return MOUTH_IMAGES.closed;
    // Le saut de joie d'un sub : un grand sourire, le corps bondit (joy.rules.ts).
    case "joy":
      return "front-smile-rest";
    default:
      return null;
  }
};

const toImage = (state: FoxState, now: number): FoxImage => {
  if (state.isSpeaking) return state.mouth;
  const shown = toModeImage(state, now);
  if (shown) return shown;
  return state.blinkEndsAt === null ? state.gaze : BLINK_IMAGE;
};

// En parlant, la bouche ; sinon l'image du mode (réaction, coucou, bâillement) ; sinon les yeux fermés le temps d'un
// clignement, sinon le regard. Le corps respire (un étirement lent, en cosinus : il part et revient à sa taille) ; le
// rebond écrase et étire, la largeur compensant à moitié.
export function toFoxDisplay(state: FoxState, now: number, rules: FoxRules): FoxDisplay {
  const breath = 1 + rules.breath * (0.5 - 0.5 * Math.cos((2 * Math.PI * now) / rules.breathPeriod));
  const stretch = rules.bounce * state.bounce;
  return { image: toImage(state, now), scaleX: 1 - stretch / 2, scaleY: breath * (1 + stretch) };
}
