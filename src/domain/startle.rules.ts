import type { Settings } from "./settings.schema";

// Le sursaut du jeu : un spike du level du desktop monte d'au moins `rise` dB en moins de `within` ms, jusqu'au-dessus de `level`
// dB ; au plus un sursaut par `gap` ms.
export type StartleRules = { rise: number; within: number; level: number; gap: number };

// Sans les réglages du renard (tous ou aucun), le jeu ne le fait pas sursauter.
export function toStartleRules({
  foxStartleRise,
  foxStartleWithin,
  foxStartleLevel,
  foxStartleGap,
}: Settings): StartleRules | undefined {
  if (
    foxStartleRise === undefined ||
    foxStartleWithin === undefined ||
    foxStartleLevel === undefined ||
    foxStartleGap === undefined
  )
    return undefined;
  return { rise: foxStartleRise, within: foxStartleWithin, level: foxStartleLevel, gap: foxStartleGap };
}

// Une mesure du level du desktop (dB) à un instant (ms).
export type Sample = { at: number; level: number };

// Les mesures de moins de `within` ms : de quoi savoir d'où le level monte.
export const toRecentSamples = (samples: readonly Sample[], now: number, within: number): Sample[] =>
  samples.filter(({ at }) => now - at < within);

// Un spike : le level dépasse `level` (strictement), et il a monté d'au moins `rise` dB depuis la plus basse des mesures
// récentes. Sans mesure récente, rien ne dit d'où il monte.
export function isSpike(recent: readonly Sample[], current: number, { rise, level }: StartleRules): boolean {
  if (recent.length === 0 || current <= level) return false;
  return current - Math.min(...recent.map((sample) => sample.level)) >= rise;
}
