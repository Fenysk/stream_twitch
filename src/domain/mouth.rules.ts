import type { Mouth, Pose } from "./head.types";

export type MouthRules = { poses: Pose[]; closedChance: number; delay: number };

export type NextMouthInput = {
  previous: Mouth;
  lastLoudAt: number | null;
  now: number;
  rules: MouthRules;
  random: () => number;
};

const CLOSED: Mouth = { kind: "closed" };

export function isLoud(level: number, threshold: number): boolean {
  return level > threshold;
}

// « Elle parle » : le level a dépassé le threshold il y a moins de `delay` ms.
const isTalking = (lastLoudAt: number | null, now: number, delay: number): boolean =>
  lastLoudAt !== null && now - lastLoudAt < delay;

// Jamais la même pose que la précédente ; l'indice est borné au cas où le hasard rendrait 1.
const pickPose = (previous: Mouth, poses: Pose[], random: () => number): Mouth => {
  const others = previous.kind === "open" ? poses.filter((pose) => pose !== previous.pose) : poses;
  const pool = others.length > 0 ? others : poses;
  const pose = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return pose ? { kind: "open", pose } : CLOSED;
};

// Le `tick()` de l'aperçu de l'outil : depuis fermée toujours une pose, sinon fermée avec la probabilité closedChance.
export function toNextMouth({ previous, lastLoudAt, now, rules, random }: NextMouthInput): Mouth {
  if (!isTalking(lastLoudAt, now, rules.delay)) return CLOSED;
  if (previous.kind === "open" && random() < rules.closedChance) return CLOSED;
  return pickPose(previous, rules.poses, random);
}
