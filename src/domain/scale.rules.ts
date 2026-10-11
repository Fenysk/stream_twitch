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
export function toScaleCurve(settings: Settings): ScaleCurve | undefined {
  const { quietScale, loudScale, loudLevel } = settings;
  if (quietScale === undefined || loudScale === undefined || loudLevel === undefined) return undefined;
  return { quietLevel: settings.quietLevel ?? settings.threshold, loudLevel, quietScale, loudScale };
}
