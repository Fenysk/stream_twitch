import type { Settings } from "./settings.schema";
import { toSpokenClock, toSpokenDuration, toSpokenHours } from "./spoken-time.rules";

// Les listes de phrases de l'heure du live (réglages `fox*`).
export type HoursKey =
  | "foxHourPhrases"
  | "foxEndWarningPhrases"
  | "foxEndPhrases"
  | "foxOvertimePhrases"
  | "foxBedtimePhrases";

// Les réglages de l'heure du live : la fin prévue (« HH:MM », vide : pas de fin prévue), combien de ms avant elle il prévient,
// l'écart (ms) entre deux rappels après elle, l'heure (« HH:MM ») après laquelle il bâille sans fin prévue, l'écart (ms) entre
// deux bâillements tardifs, et les listes de phrases.
export type HoursRules = {
  endTime: string;
  warning: number;
  overtimeGap: number;
  lateAfter: string;
  lateYawnMin: number;
  lateYawnMax: number;
  phrases: Readonly<Record<HoursKey, readonly string[]>>;
};

// Sans les réglages du renard (tous ou aucun), il ne tient pas l'heure.
export function toHoursRules({
  foxHourPhrases,
  foxEndTime,
  foxEndWarning,
  foxEndWarningPhrases,
  foxEndPhrases,
  foxOvertimeGap,
  foxOvertimePhrases,
  foxBedtimePhrases,
  foxLateAfter,
  foxLateYawnMin,
  foxLateYawnMax,
}: Settings): HoursRules | undefined {
  if (
    foxHourPhrases === undefined ||
    foxEndTime === undefined ||
    foxEndWarning === undefined ||
    foxEndWarningPhrases === undefined ||
    foxEndPhrases === undefined ||
    foxOvertimeGap === undefined ||
    foxOvertimePhrases === undefined ||
    foxBedtimePhrases === undefined ||
    foxLateAfter === undefined ||
    foxLateYawnMin === undefined ||
    foxLateYawnMax === undefined
  )
    return undefined;
  return {
    endTime: foxEndTime,
    warning: foxEndWarning,
    overtimeGap: foxOvertimeGap,
    lateAfter: foxLateAfter,
    lateYawnMin: foxLateYawnMin,
    lateYawnMax: foxLateYawnMax,
    phrases: { foxHourPhrases, foxEndWarningPhrases, foxEndPhrases, foxOvertimePhrases, foxBedtimePhrases },
  };
}

export type ClockTime = { hours: number; minutes: number };

const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// « 23:30 » donne 23 h 30 ; un texte vide (pas de fin prévue) ou qui n'est pas une heure donne `null`.
export function toClockTime(text: string): ClockTime | null {
  const match = CLOCK_TIME.exec(text);
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

// La première fois que l'heure sonne, à l'heure locale, strictement après `after` : minuit pour un live commencé à 21 h.
export function toNextOccurrence(after: number, { hours, minutes }: ClockTime): number {
  const date = new Date(after);
  const sameDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
  if (sameDay > after) return sameDay;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, hours, minutes).getTime();
}

export const HOUR_MS = 3_600_000;

// Combien d'heures pleines de diffusion se sont écoulées depuis son début.
export const toHourCount = (startedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - startedAt) / HOUR_MS));

// Les étapes de la fin : il prévient, annonce la fin, rappelle (deux fois, toutes les `overtimeGap`), puis se couche au
// rappel suivant (le troisième).
export type StageKind = "warning" | "end" | "overtime" | "bedtime";
export type Stage = { at: number; kind: StageKind };

export const OVERTIME_REMINDERS = 2;

export function toEndStages(
  end: number,
  { warning, overtimeGap }: Pick<HoursRules, "warning" | "overtimeGap">,
): Stage[] {
  const stages: Stage[] = [
    { at: end - warning, kind: "warning" },
    { at: end, kind: "end" },
  ];
  for (let index = 1; index <= OVERTIME_REMINDERS; index += 1)
    stages.push({ at: end + index * overtimeGap, kind: "overtime" });
  stages.push({ at: end + (OVERTIME_REMINDERS + 1) * overtimeGap, kind: "bedtime" });
  return stages;
}

// Ce qu'il dit à une étape : la liste de phrases, les valeurs de leurs variables, et vers qui il est tourné.
export type HoursPlan = {
  list: HoursKey;
  values: Readonly<Record<string, string | number>>;
  isForFenysk: boolean;
};

const STAGE_LISTS: Readonly<Record<StageKind, HoursKey>> = {
  warning: "foxEndWarningPhrases",
  end: "foxEndPhrases",
  overtime: "foxOvertimePhrases",
  bedtime: "foxBedtimePhrases",
};

// Une heure pleine de diffusion s'adresse au tchat : `{heures}` dit « 1 heure », « 2 heures ».
export const toHourPlan = (count: number): HoursPlan => ({
  list: "foxHourPhrases",
  values: { heures: toSpokenHours(count) },
  isForFenysk: false,
});

// Les étapes de la fin s'adressent à Fenysk. `{minutes}` : l'avance de l'avertissement ; `{fin}` et `{maintenant}` : des heures
// dites ; `{retard}` : le temps passé depuis la fin, à la minute près.
export const toStagePlan = (
  { kind }: Stage,
  { end, now, warning }: { end: number; now: number; warning: number },
): HoursPlan => ({
  list: STAGE_LISTS[kind],
  values: {
    minutes: Math.round(warning / 60_000),
    fin: toSpokenClock(end),
    maintenant: toSpokenClock(now),
    retard: toSpokenDuration(Math.max(0, Math.round((now - end) / 60_000))),
  },
  isForFenysk: true,
});

// Après quoi il bâille au repos : la fin prévue, ou à défaut `lateAfter` (la première fois après le début de la diffusion).
export function toLateFrom(startedAt: number, end: number | null, lateAfter: string): number | null {
  if (end !== null) return end;
  const time = toClockTime(lateAfter);
  return time ? toNextOccurrence(startedAt, time) : null;
}

// Le temps (ms) avant le bâillement suivant : entre le minimum et le maximum, au hasard.
export const toLateYawnDelay = (
  { lateYawnMin, lateYawnMax }: Pick<HoursRules, "lateYawnMin" | "lateYawnMax">,
  random: () => number,
): number => lateYawnMin + random() * (lateYawnMax - lateYawnMin);
