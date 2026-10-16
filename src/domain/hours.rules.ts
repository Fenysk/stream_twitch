import type { Settings } from "./settings.schema";
import { toSpokenClock, toSpokenDuration, toSpokenHours } from "./spoken-time.rules";

// Les listes de phrases de l'heure du live (réglages `fox*`).
export type HoursKey =
  | "foxHourPhrases"
  | "foxEndWarningPhrases"
  | "foxEndSoonPhrases"
  | "foxEndPanicPhrases"
  | "foxEndPhrases"
  | "foxOvertimePhrases"
  | "foxBedtimePhrases";

// Les réglages de l'heure du live : la fin prévue (« HH:MM », vide : pas de fin prévue), les paliers d'avertissement (minutes
// avant elle, du plus tôt au plus tard), l'écart (ms) entre deux rappels après elle, l'heure (« HH:MM ») après laquelle il bâille
// sans fin prévue, l'écart (ms) entre deux bâillements tardifs, et les listes de phrases.
export type HoursRules = {
  endTime: string;
  warningMarks: readonly number[];
  overtimeGap: number;
  lateAfter: string;
  lateYawnMin: number;
  lateYawnMax: number;
  phrases: Readonly<Record<HoursKey, readonly string[]>>;
};

// Les paliers d'un réglage (une ligne chacun) : une ligne qui n'est pas un entier de minutes positif est ignorée, un doublon
// aussi ; du plus tôt avant la fin (le plus grand) au plus tard.
export const toWarningMarks = (lines: readonly string[]): number[] =>
  [...new Set(lines.map(Number).filter((minutes) => Number.isInteger(minutes) && minutes > 0))].sort(
    (first, second) => second - first,
  );

// Sans les réglages du renard (tous ou aucun), il ne tient pas l'heure.
export function toHoursRules({
  foxHourPhrases,
  foxEndTime,
  foxEndWarningMarks,
  foxEndWarningPhrases,
  foxEndSoonPhrases,
  foxEndPanicPhrases,
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
    foxEndWarningMarks === undefined ||
    foxEndWarningPhrases === undefined ||
    foxEndSoonPhrases === undefined ||
    foxEndPanicPhrases === undefined ||
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
    warningMarks: toWarningMarks(foxEndWarningMarks),
    overtimeGap: foxOvertimeGap,
    lateAfter: foxLateAfter,
    lateYawnMin: foxLateYawnMin,
    lateYawnMax: foxLateYawnMax,
    phrases: {
      foxHourPhrases,
      foxEndWarningPhrases,
      foxEndSoonPhrases,
      foxEndPanicPhrases,
      foxEndPhrases,
      foxOvertimePhrases,
      foxBedtimePhrases,
    },
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

// La dernière fois que l'heure a sonné, à l'heure locale, à `before` près (compris) : hier soir pour 23:00 à minuit passé.
function toPreviousOccurrence(before: number, { hours, minutes }: ClockTime): number {
  const date = new Date(before);
  const sameDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
  if (sameDay <= before) return sameDay;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, hours, minutes).getTime();
}

export const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

// La fin prévue vue de `now`, sans rien savoir du live : sonnée il y a moins de 3 h, c'est un dépassement (`elapsed` ms) ; sinon la
// prochaine, à venir (`remaining` ms, 21 h au plus). Le renard se couche 1 h 30 après la fin au plus tard : 3 h suffisent.
export type EndStatus =
  | { kind: "none" }
  | { kind: "upcoming"; end: number; remaining: number }
  | { kind: "overtime"; end: number; elapsed: number };

const OVERTIME_SPAN_MS = 3 * HOUR_MS;
// Le plus loin qu'une heure reste « à venir » : le reste du jour une fois la fenêtre du dépassement retirée.
const MAX_AHEAD_MS = 24 * HOUR_MS - OVERTIME_SPAN_MS;

export function toEndStatus(endTime: string, now: number): EndStatus {
  const time = toClockTime(endTime);
  if (!time) return { kind: "none" };
  const previous = toPreviousOccurrence(now, time);
  if (now - previous < OVERTIME_SPAN_MS) return { kind: "overtime", end: previous, elapsed: now - previous };
  const next = toNextOccurrence(now, time);
  return { kind: "upcoming", end: next, remaining: next - now };
}

// « HH:MM » à l'heure locale : la forme que le réglage de la fin prévue garde.
const toTimeText = (at: number): string => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export const END_STEP_MINUTES = 10;

// Le premier multiple de 10 min à l'heure locale strictement après `at`, ou strictement avant (`at` à la minute pile).
const toStepAfter = (at: number): number => {
  const date = new Date(at);
  const minutes = (Math.floor(date.getMinutes() / END_STEP_MINUTES) + 1) * END_STEP_MINUTES;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes).getTime();
};

const toStepBefore = (at: number): number => {
  const date = new Date(at);
  const minutes = (Math.ceil(date.getMinutes() / END_STEP_MINUTES) - 1) * END_STEP_MINUTES;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), minutes).getTime();
};

// Un cran de la fin prévue (une touche de Stream Deck) : « later » la repousse à la dizaine de minutes suivante, « sooner » la
// ramène à la précédente. Elle ne passe jamais avant la dizaine qui suit `now`, ni au-delà de `now` + 21 h (l'heure serait alors
// lue comme dépassée) : ces deux appuis ne changent rien (`endTime` revient tel quel). Une fin ramenée à `now` ou avant n'est plus
// prévue : le texte vide.
export type EndDirection = "later" | "sooner";

export function toSteppedEndTime(endTime: string, now: number, direction: EndDirection): string {
  const status = toEndStatus(endTime, now);
  const end = status.kind === "none" ? null : status.end;
  if (direction === "sooner") {
    if (end === null) return endTime;
    const target = toStepBefore(end);
    return target > now ? toTimeText(target) : "";
  }
  const target = end === null ? toStepAfter(now) : Math.max(toStepAfter(end), toStepAfter(now));
  return target - now <= MAX_AHEAD_MS ? toTimeText(target) : endTime;
}

// Combien d'heures pleines de diffusion se sont écoulées depuis son début.
export const toHourCount = (startedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - startedAt) / HOUR_MS));

// Les étapes de la fin : il prévient à chaque palier (`minutes` avant la fin), annonce la fin, rappelle (deux fois, toutes les
// `overtimeGap`), puis se couche au rappel suivant (le troisième).
export type Stage =
  | { at: number; kind: "warning"; minutes: number }
  | { at: number; kind: "end" | "overtime" | "bedtime" };

export const OVERTIME_REMINDERS = 2;

// Le ton de l'avertissement monte : calme à plus de `END_SOON_MINUTES` avant la fin, pressant jusqu'à `END_PANIC_MINUTES` exclu,
// paniqué à partir de là.
export const END_SOON_MINUTES = 15;
export const END_PANIC_MINUTES = 2;

export function toEndStages(
  end: number,
  { warningMarks, overtimeGap }: Pick<HoursRules, "warningMarks" | "overtimeGap">,
): Stage[] {
  const stages: Stage[] = warningMarks.map((minutes) => ({
    at: end - minutes * MINUTE_MS,
    kind: "warning",
    minutes,
  }));
  stages.push({ at: end, kind: "end" });
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

const STAGE_LISTS: Readonly<Record<"end" | "overtime" | "bedtime", HoursKey>> = {
  end: "foxEndPhrases",
  overtime: "foxOvertimePhrases",
  bedtime: "foxBedtimePhrases",
};

// La liste d'un avertissement selon les minutes qui restent : plus de 15 calme, de 15 à 3 pressant, 2 et moins paniqué.
const toWarningList = (minutes: number): HoursKey => {
  if (minutes <= END_PANIC_MINUTES) return "foxEndPanicPhrases";
  return minutes <= END_SOON_MINUTES ? "foxEndSoonPhrases" : "foxEndWarningPhrases";
};

// Une heure pleine de diffusion s'adresse au tchat : `{heures}` dit « 1 heure », « 2 heures ».
export const toHourPlan = (count: number): HoursPlan => ({
  list: "foxHourPhrases",
  values: { heures: toSpokenHours(count) },
  isForFenysk: false,
});

// Les étapes de la fin s'adressent à Fenysk. `{fin}` et `{maintenant}` : des heures dites ; `{retard}` : le temps passé depuis la
// fin, à la minute près ; pour un avertissement, `{minutes}` : son palier en nombre, `{reste}` : ce palier dit (« 1 heure 30 »).
export function toStagePlan(stage: Stage, { end, now }: { end: number; now: number }): HoursPlan {
  const values = {
    fin: toSpokenClock(end),
    maintenant: toSpokenClock(now),
    retard: toSpokenDuration(Math.max(0, Math.round((now - end) / MINUTE_MS))),
  };
  if (stage.kind !== "warning") return { list: STAGE_LISTS[stage.kind], values, isForFenysk: true };
  return {
    list: toWarningList(stage.minutes),
    values: { ...values, minutes: stage.minutes, reste: toSpokenDuration(stage.minutes) },
    isForFenysk: true,
  };
}

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
