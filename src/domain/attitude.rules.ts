import type { Attitude } from "./fox.schema";
import type { Settings } from "./settings.schema";

// Au plus une phrase de reprise dans ce délai (ms).
export const RESUME_GAP_MS = 1_800_000;

// Les réglages de l'humeur : joyeux à ce nombre de messages acceptés dans cette période (ms) ; boudeur après ce silence du
// tchat (ms) ; la reprise après ce silence (ms), et ses phrases.
export type AttitudeRules = {
  cheerfulCount: number;
  cheerfulPeriod: number;
  sulkAfter: number;
  resumeAfter: number;
  resumePhrases: readonly string[];
};

// Sans les réglages du renard (tous ou aucun), l'humeur ne change pas.
export function toAttitudeRules(settings: Settings): AttitudeRules | undefined {
  const { foxCheerfulCount, foxCheerfulPeriod, foxSulkAfter, foxResumeAfter, foxResumePhrases } = settings;
  if (
    foxCheerfulCount === undefined ||
    foxCheerfulPeriod === undefined ||
    foxSulkAfter === undefined ||
    foxResumeAfter === undefined ||
    foxResumePhrases === undefined
  )
    return undefined;
  return {
    cheerfulCount: foxCheerfulCount,
    cheerfulPeriod: foxCheerfulPeriod,
    sulkAfter: foxSulkAfter,
    resumeAfter: foxResumeAfter,
    resumePhrases: foxResumePhrases,
  };
}

// Les messages acceptés dans la période qui finit à `now` : ceux de plus de `period` ms sortent du compte.
export const toRecentTimes = (times: readonly number[], now: number, period: number): number[] =>
  times.filter((at) => now - at < period);

export type AttitudeInput = {
  now: number;
  // Il est visible : parti ou en train de partir, son humeur ne se voit pas.
  isVisible: boolean;
  // Le dernier message du tchat (accepté ou non), ou le démarrage du serveur.
  lastChatAt: number;
  // Les messages acceptés de la période.
  recent: readonly number[];
};

// Boudeur : visible, sans message du tchat depuis `sulkAfter`. Joyeux : `cheerfulCount` messages acceptés ou plus dans la période.
// Le silence l'emporte sur l'animation d'avant.
export function toAttitude(
  { now, isVisible, lastChatAt, recent }: AttitudeInput,
  { cheerfulCount, sulkAfter }: Pick<AttitudeRules, "cheerfulCount" | "sulkAfter">,
): Attitude {
  if (!isVisible) return "plain";
  if (now - lastChatAt >= sulkAfter) return "sulking";
  return recent.length >= cheerfulCount ? "cheerful" : "plain";
}

// La reprise : un message accepté arrive après `resumeAfter` ms sans message du tchat, et la dernière reprise date de plus de
// 30 min (ou n'a jamais eu lieu).
export const isResumeDue = (
  { now, lastChatAt, lastResumeAt }: { now: number; lastChatAt: number; lastResumeAt: number | null },
  { resumeAfter }: Pick<AttitudeRules, "resumeAfter">,
): boolean =>
  now - lastChatAt >= resumeAfter && (lastResumeAt === null || now - lastResumeAt >= RESUME_GAP_MS);
