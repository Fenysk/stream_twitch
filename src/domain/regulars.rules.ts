import type { Regular } from "./regulars.schema";
import type { Settings } from "./settings.schema";

export const DAY_MS = 86_400_000;

// Un fichier de moins de 14 jours ne prouve ni qu'un viewer est nouveau, ni qu'il revient après une absence.
export const OBSERVATION_MS = 14 * DAY_MS;

// Au plus une phrase d'accueil dans ce délai (ms) ; au-delà, le coucou seul.
export const WELCOME_GAP_MS = 30_000;

// Les listes de phrases d'accueil (réglages `fox*`), une par cas.
export type WelcomeKey =
  | "foxWelcomeMilestone"
  | "foxWelcomeReturn"
  | "foxWelcomeYesterday"
  | "foxWelcomeFirst";

// Les réglages de l'accueil : la case, le silence (ms) qui sépare deux lives d'un viewer, les nombres de lives qui ont un
// palier, l'absence (ms) à partir de laquelle un viewer « revient » (`returnAfter`), et les phrases de chaque cas.
export type WelcomeRules = {
  shouldWelcome: boolean;
  liveGap: number;
  liveCounts: readonly number[];
  returnAfter: number;
  phrases: Readonly<Record<WelcomeKey, readonly string[]>>;
};

// Un nombre de lives par ligne ; une ligne qui n'est pas un nombre entier positif est ignorée.
export const toLiveCounts = (lines: readonly string[]): number[] =>
  lines.map(Number).filter((count) => Number.isInteger(count) && count > 0);

// Sans les réglages du renard (tous ou aucun), il n'accueille personne.
export function toWelcomeRules(settings: Settings): WelcomeRules | undefined {
  const {
    foxShouldWelcome,
    foxWelcomeLiveGap,
    foxWelcomeLiveCounts,
    foxWelcomeReturnAfter,
    foxWelcomeMilestone,
    foxWelcomeReturn,
    foxWelcomeYesterday,
    foxWelcomeFirst,
  } = settings;
  if (
    foxShouldWelcome === undefined ||
    foxWelcomeLiveGap === undefined ||
    foxWelcomeLiveCounts === undefined ||
    foxWelcomeReturnAfter === undefined ||
    foxWelcomeMilestone === undefined ||
    foxWelcomeReturn === undefined ||
    foxWelcomeYesterday === undefined ||
    foxWelcomeFirst === undefined
  )
    return undefined;
  return {
    shouldWelcome: foxShouldWelcome,
    liveGap: foxWelcomeLiveGap,
    liveCounts: toLiveCounts(foxWelcomeLiveCounts),
    returnAfter: foxWelcomeReturnAfter,
    phrases: { foxWelcomeMilestone, foxWelcomeReturn, foxWelcomeYesterday, foxWelcomeFirst },
  };
}

// Un viewer qui écrit après `liveGap` ms de silence commence un live de plus ; sinon, c'est le même live.
export type Visit = { regular: Regular; isLiveStart: boolean };

export function toVisit(previous: Regular | undefined, now: number, liveGap: number): Visit {
  if (previous === undefined)
    return { regular: { firstSeen: now, lastSeen: now, lives: 1 }, isLiveStart: true };
  const isLiveStart = now - previous.lastSeen > liveGap;
  return {
    regular: { ...previous, lastSeen: now, lives: isLiveStart ? previous.lives + 1 : previous.lives },
    isLiveStart,
  };
}

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Le jour calendaire d'un instant, à l'heure de Paris : « 2026-10-14 ».
export const toParisDay = (at: number): string => PARIS_DAY.format(at);

const toDayNumber = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

// `lastSeen` est le jour calendaire d'avant celui de `now` (à Paris) : passé minuit, un live qui continue n'y change rien.
export const isYesterday = (lastSeen: number, now: number): boolean =>
  toDayNumber(toParisDay(now)) - toDayNumber(toParisDay(lastSeen)) === 1;

// « 2 semaines », « 1 mois » : la durée dite d'une absence, arrondie vers le bas à l'unité.
export function toAwayText(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days < 7) return `${days} ${days > 1 ? "jours" : "jour"}`;
  if (days < 30) return `${Math.floor(days / 7)} ${days >= 14 ? "semaines" : "semaine"}`;
  if (days < 365) return `${Math.floor(days / 30)} mois`;
  return `${Math.floor(days / 365)} ${days >= 730 ? "ans" : "an"}`;
}

// Ce qu'il dit à un viewer qui commence un live : la liste de phrases, et les valeurs de leurs variables.
export type WelcomePlan = { list: WelcomeKey; values: Readonly<Record<string, string | number>> };

export type WelcomeInput = {
  previous: Regular | undefined;
  regular: Regular;
  nickname: string;
  now: number;
  // La création du fichier : avant `OBSERVATION_MS`, ni « nouveau » ni « de retour ».
  createdAt: number;
};

// Un seul cas, dans cet ordre : un palier de lives, un retour après une longue absence, la venue de la veille, le tout premier
// message. Aucun cas : le coucou seul.
export function toWelcomePlan(
  { previous, regular, nickname, now, createdAt }: WelcomeInput,
  { liveCounts, returnAfter }: Pick<WelcomeRules, "liveCounts" | "returnAfter">,
): WelcomePlan | null {
  if (liveCounts.includes(regular.lives)) {
    return { list: "foxWelcomeMilestone", values: { user: nickname, lives: regular.lives } };
  }
  const isObserved = now - createdAt >= OBSERVATION_MS;
  if (previous === undefined)
    return isObserved ? { list: "foxWelcomeFirst", values: { user: nickname } } : null;
  const away = now - previous.lastSeen;
  if (isObserved && away >= returnAfter) {
    return { list: "foxWelcomeReturn", values: { user: nickname, absence: toAwayText(away) } };
  }
  return isYesterday(previous.lastSeen, now)
    ? { list: "foxWelcomeYesterday", values: { user: nickname } }
    : null;
}
