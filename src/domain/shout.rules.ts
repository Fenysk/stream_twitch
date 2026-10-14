import type { Settings } from "./settings.schema";

// Le cri : le threshold (dB) du level du mic, l'écart (ms) sous lequel deux passages ne font qu'un shout, puis ce qui est
// pénible (`count` cris en `period` ms, ou un cri de plus de `long` ms) et l'écart (ms) entre deux phrases de cri.
export type ShoutRules = {
  threshold: number;
  merge: number;
  count: number;
  period: number;
  long: number;
  gap: number;
};

// Sans les réglages du renard (tous ou aucun), pas de cri.
export function toShoutRules({
  foxShoutThreshold,
  foxShoutMerge,
  foxShoutCount,
  foxShoutPeriod,
  foxShoutLong,
  foxShoutGap,
}: Settings): ShoutRules | undefined {
  if (
    foxShoutThreshold === undefined ||
    foxShoutMerge === undefined ||
    foxShoutCount === undefined ||
    foxShoutPeriod === undefined ||
    foxShoutLong === undefined ||
    foxShoutGap === undefined
  )
    return undefined;
  return {
    threshold: foxShoutThreshold,
    merge: foxShoutMerge,
    count: foxShoutCount,
    period: foxShoutPeriod,
    long: foxShoutLong,
    gap: foxShoutGap,
  };
}

// Un cri en cours : son début, son dernier passage au-dessus du threshold, et s'il compte (le renard était visible à son
// début : caché, un cri ne compte pas).
export type Shout = { startedAt: number; lastLoudAt: number; isCounted: boolean };

// Un nouveau passage à `now` prolonge le cri en cours quand le dernier date de moins de `merge` ms.
export const isShoutContinued = (shout: Shout | null, now: number, merge: number): shout is Shout =>
  shout !== null && now - shout.lastLoudAt < merge;

// Combien de ms le cri a duré, du début à son dernier passage.
export const toShoutLength = ({ startedAt, lastLoudAt }: Shout): number => lastLoudAt - startedAt;

// Les débuts de cri qui datent de moins de `period` ms.
export const toRecentStarts = (starts: readonly number[], now: number, period: number): number[] =>
  starts.filter((at) => now - at < period);

// Pénible : `count` débuts de cri dans la période, ou ce cri dure plus de `long` ms (strictement).
export const isShoutPainful = (recent: number, shout: Shout, { count, long }: ShoutRules): boolean =>
  recent >= count || toShoutLength(shout) > long;
