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
}: Pick<Settings, "foxStartleRise" | "foxStartleWithin" | "foxStartleLevel" | "foxStartleGap">):
  | StartleRules
  | undefined {
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

// Le pas en ms entre deux mesures du son d'un clip : celui des mesures d'OBS (InputVolumeMeters, toutes les 50 ms).
export const LEVEL_STEP_MS = 50;

// Les instants (ms depuis le début) où une suite de levels, un par `stepMs`, ferait sursauter le renard : le même calcul que le sursaut du
// jeu en direct (hausse brusque jusqu'à un level fort, au plus un par `gap`), appliqué au son d'un clip.
export function toSpikes(levels: readonly number[], stepMs: number, rules: StartleRules): number[] {
  const spikes: number[] = [];
  let samples: Sample[] = [];
  let lastAt: number | null = null;
  levels.forEach((level, index) => {
    const at = index * stepMs;
    const recent = toRecentSamples(samples, at, rules.within);
    samples = [...recent, { at, level }];
    if (!isSpike(recent, level, rules)) return;
    if (lastAt !== null && at - lastAt < rules.gap) return;
    lastAt = at;
    spikes.push(at);
  });
  return spikes;
}
