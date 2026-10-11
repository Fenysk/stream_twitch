import type { IdlePose } from "./head.types";
import type { Settings } from "./settings.schema";

export type IdleRules = { min: number; max: number; angle: number; lift: number };

// La pose de repos en cours, et l'instant où elle change (null : pas de repos en cours).
export type IdleState = { pose: IdlePose; changeAt: number | null };

export type NextIdleInput = {
  previous: IdleState;
  isIdle: boolean;
  now: number;
  rules: IdleRules;
  random: () => number;
};

export const IDLE_NEUTRAL: IdlePose = { angle: 0, lift: 0 };
export const IDLE_START: IdleState = { pose: IDLE_NEUTRAL, changeAt: null };

export const isSameIdlePose = (a: IdlePose, b: IdlePose): boolean => a.angle === b.angle && a.lift === b.lift;

// Sans les quatre réglages, pas de règles : pas d'animation de repos.
export function toIdleRules(settings: Settings): IdleRules | undefined {
  const { idleMin, idleMax, idleAngle, idleLift } = settings;
  if (idleMin === undefined || idleMax === undefined || idleAngle === undefined || idleLift === undefined) {
    return undefined;
  }
  return { min: idleMin, max: idleMax, angle: idleAngle, lift: idleLift };
}

// Neutre, penchée de chaque côté, levée : la rotation se fait autour du bas-centre de l'image, comme un cou.
export function toIdlePoses({ angle, lift }: IdleRules): IdlePose[] {
  return [IDLE_NEUTRAL, { angle: -angle, lift: 0 }, { angle, lift: 0 }, { angle: 0, lift }];
}

const toDuration = (rules: IdleRules, random: () => number): number =>
  rules.min + random() * (rules.max - rules.min);

// Jamais la même pose que la précédente ; l'indice est borné au cas où le hasard rendrait 1.
const pickIdlePose = (previous: IdlePose, rules: IdleRules, random: () => number): IdlePose => {
  const poses = toIdlePoses(rules);
  const others = poses.filter((pose) => !isSameIdlePose(pose, previous));
  const pool = others.length > 0 ? others : poses;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? IDLE_NEUTRAL;
};

// Le changement se décide quand l'instant prévu est passé : l'appelant n'a besoin que d'un pas régulier.
export function toNextIdle({ previous, isIdle, now, rules, random }: NextIdleInput): IdleState {
  if (!isIdle) return IDLE_START;
  if (previous.changeAt === null) return { pose: previous.pose, changeAt: now + toDuration(rules, random) };
  if (now < previous.changeAt) return previous;
  const pose = pickIdlePose(previous.pose, rules, random);
  return { pose, changeAt: now + toDuration(rules, random) };
}
