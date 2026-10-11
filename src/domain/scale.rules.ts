import type { Settings } from "./settings.schema";

export type ScaleCurve = { quietLevel: number; loudLevel: number; quietScale: number; loudScale: number };

// Linéaire en dB entre quietLevel et loudLevel, borné aux deux scales. Ne décide pas si la tête parle : c'est le threshold.
export function toScale(level: number, { quietLevel, loudLevel, quietScale, loudScale }: ScaleCurve): number {
  const span = loudLevel - quietLevel;
  if (span <= 0) return level > quietLevel ? loudScale : quietScale;
  const position = Math.min(1, Math.max(0, (level - quietLevel) / span));
  return quietScale + (loudScale - quietScale) * position;
}

// Sans les trois réglages, pas de courbe : le scale vaut 1 partout. Le quietLevel vaut le threshold quand il manque.
// `quietScale` et `loudScale` sont les extrêmes, atteints quand `voiceEffect` vaut 1 (100 %) ; à 0, le scale vaut 1 partout.
// Entre les deux c'est linéaire : voix douce = 1 - (1 - quietScale) × effet, voix forte = 1 + (loudScale - 1) × effet.
export function toScaleCurve(settings: Settings): ScaleCurve | undefined {
  const { quietScale, loudScale, loudLevel } = settings;
  if (quietScale === undefined || loudScale === undefined || loudLevel === undefined) return undefined;
  const effect = settings.voiceEffect ?? 1;
  const round = (value: number): number => Math.round(value * 1e9) / 1e9;
  return {
    quietLevel: settings.quietLevel ?? settings.threshold,
    loudLevel,
    quietScale: round(1 - (1 - quietScale) * effect),
    loudScale: round(1 + (loudScale - 1) * effect),
  };
}
