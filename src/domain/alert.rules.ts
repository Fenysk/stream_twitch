import { isLiveMicOf, PC_MIC_ID, toLiveMic } from "./control.rules";
import type { ControlMic } from "./control.schema";
import type { PhoneRole } from "./phone.schema";
import { HEAD_PICTURE_ID, toPictureLabel } from "./picture.rules";
import type { PictureStanding } from "./picture.schema";

// Les alertes de /mobile, de la plus prioritaire à la moins prioritaire : une seule se montre à la fois, sous le bandeau.
export const ALERT_KINDS = [
  "lost",
  "stopped",
  "unlinked",
  "muted",
  "camera-stopped",
  "camera-ready",
  "mic-away",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

// Une alerte ne se montre que quand sa condition dure depuis 3 s : un état faux qui se corrige seul n'avertit pas.
export const ALERT_DELAY_MS = 3000;
// Un arrêt du live est « demandé ici » dans les 30 s qui suivent l'appui sur « Arrêter » de ce téléphone.
export const ALERT_STOP_ASKED_MS = 30_000;

// Les rôles qui montrent l'alerte, et si elle se montre tout de suite (le live arrêté se voit sans attendre). La Caméra n'a ni « Ta caméra
// s'est arrêtée » (l'avis de caméra arrêtée couvre déjà son aperçu et relance d'un toucher) ni les alertes de la régie.
const ALERT_RULES: Record<AlertKind, { roles: readonly PhoneRole[]; isImmediate: boolean }> = {
  lost: { roles: ["control", "selfie", "camera"], isImmediate: false },
  stopped: { roles: ["control", "selfie"], isImmediate: true },
  unlinked: { roles: ["control", "selfie"], isImmediate: false },
  muted: { roles: ["control", "selfie"], isImmediate: false },
  "camera-stopped": { roles: ["selfie"], isImmediate: false },
  "camera-ready": { roles: ["selfie", "camera"], isImmediate: false },
  "mic-away": { roles: ["selfie"], isImmediate: false },
};

// Les conditions vraies maintenant, et l'instant où chacune l'est devenue (une condition vraie sans instant vient de commencer).
export type AlertFacts = Record<AlertKind, boolean>;
export type AlertSince = Partial<Record<AlertKind, number>>;

const isActive = (role: PhoneRole, facts: AlertFacts, kind: AlertKind): boolean =>
  facts[kind] && ALERT_RULES[kind].roles.includes(role);

const toElapsedMs = (since: AlertSince, kind: AlertKind, now: number): number => now - (since[kind] ?? now);

const isDue = (since: AlertSince, kind: AlertKind, now: number): boolean =>
  ALERT_RULES[kind].isImmediate || toElapsedMs(since, kind, now) >= ALERT_DELAY_MS;

// L'alerte à montrer : la plus prioritaire parmi celles du rôle dont la condition dure assez. Une plus prioritaire qui vient de commencer
// ne cache pas, le temps d'attendre, une autre qui dure : elle la remplace au bout de ses 3 s, sans trou entre les deux.
export const toAlert = (
  role: PhoneRole,
  facts: AlertFacts,
  since: AlertSince,
  now: number,
): AlertKind | null =>
  ALERT_KINDS.find((kind) => isActive(role, facts, kind) && isDue(since, kind, now)) ?? null;

// Les instants à retenir : une condition qui devient vraie est datée de `now`, celle qui l'était garde sa date, celle qui cesse l'oublie.
// Rend `previous` quand rien ne change.
export const toAlertSince = (previous: AlertSince, facts: AlertFacts, now: number): AlertSince => {
  const next: AlertSince = {};
  for (const kind of ALERT_KINDS) if (facts[kind]) next[kind] = previous[kind] ?? now;
  return ALERT_KINDS.every((kind) => next[kind] === previous[kind]) ? previous : next;
};

// Le temps (ms) avant que la prochaine alerte en attente devienne montrable ; `null` : aucune n'attend.
export const toAlertDelay = (
  role: PhoneRole,
  facts: AlertFacts,
  since: AlertSince,
  now: number,
): number | null => {
  const waits = ALERT_KINDS.filter((kind) => isActive(role, facts, kind) && !isDue(since, kind, now)).map(
    (kind) => ALERT_DELAY_MS - toElapsedMs(since, kind, now),
  );
  return waits.length === 0 ? null : Math.min(...waits);
};

// Le live s'est-il arrêté sans que ce téléphone l'ait demandé ? `wasLive` : il l'était au dernier état. `isStopped` : il l'était, il ne l'est
// plus, et personne n'a appuyé sur « Arrêter » ici (`isAsked`) ; retenu jusqu'à ce que le live reparte. Rend `previous` quand rien ne change.
export type StopMemory = { wasLive: boolean; isStopped: boolean };

export const toStopMemory = (previous: StopMemory, isLive: boolean, isAsked: boolean): StopMemory => {
  const isStopped = !isLive && (previous.isStopped || (previous.wasLive && !isAsked));
  return previous.wasLive === isLive && previous.isStopped === isStopped
    ? previous
    : { wasLive: isLive, isStopped };
};

export const isStopAsked = (askedAt: number | null, now: number): boolean =>
  askedAt !== null && now - askedAt <= ALERT_STOP_ASKED_MS;

// Ce téléphone avait-il le plan quand sa caméra s'est arrêtée ? `wasCurrent` : il l'avait au dernier état, caméra en marche. `isPlanLost` :
// la caméra s'est arrêtée avec le plan, qui est ensuite passé à la Tête (repli du serveur) ; il reste vrai caméra relancée tant que la
// Tête est au plan. Il s'oublie quand ce téléphone a de nouveau le plan, ou quand le plan va ailleurs (le choix est volontaire). Cacher la
// caméra soi-même, ou la relancer avant le repli, n'en retient rien. Rend `previous` quand rien ne change.
export type PlanMemory = { wasCurrent: boolean; isPlanLost: boolean };

export const toPlanMemory = (
  previous: PlanMemory,
  isCameraLive: boolean,
  { isCurrent, shown }: PictureStanding,
): PlanMemory => {
  const next = isCameraLive
    ? {
        wasCurrent: isCurrent,
        isPlanLost: previous.isPlanLost && !isCurrent && shown === toPictureLabel(HEAD_PICTURE_ID),
      }
    : { wasCurrent: previous.wasCurrent, isPlanLost: previous.isPlanLost || previous.wasCurrent };
  return next.wasCurrent === previous.wasCurrent && next.isPlanLost === previous.isPlanLost ? previous : next;
};

// Le micro que « Rallumer » rouvre : le dernier vu ouvert sur ce téléphone s'il est encore connu d'OBS, sinon le PC.
export const toReopenMicId = (mics: readonly ControlMic[], lastId: string | null): string =>
  mics.find(({ id, isAvailable }) => id === lastId && isAvailable)?.id ?? PC_MIC_ID;

// Le micro entendu quand ce téléphone a le plan et que ce n'est pas le sien ; `null` sinon (Muet compris : aucun micro n'est entendu).
export const toAwayMic = (
  mics: readonly ControlMic[],
  number: number | null,
  { isCurrent }: PictureStanding,
): ControlMic | null => {
  const live = toLiveMic(mics);
  return isCurrent && live !== null && !isLiveMicOf(mics, number) ? live : null;
};
