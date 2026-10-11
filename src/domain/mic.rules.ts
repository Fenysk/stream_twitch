const FLOOR = -100;

// Le level du mic : le pic le plus fort parmi les canaux (linéaire, 1 = pleine échelle), en dB.
export function toLevel(peaks: readonly number[]): number {
  const loudest = Math.max(0, ...peaks);
  return Math.max(FLOOR, 20 * Math.log10(loudest));
}
