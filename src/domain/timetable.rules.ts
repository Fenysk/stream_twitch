import { isFillable, toFilledPhrase } from "./phrase.rules";
import { toSpokenClock } from "./spoken-time.rules";

// Un slot de la timetable Twitch d'Alexis : un créneau de live à venir, non annulé. `start` : le début (ms) ; `title` : son titre,
// ou `null` quand il n'en a pas.
export type Slot = { start: number; title: string | null };

// Le titre d'un créneau tel qu'on le dit : sans espace ni ponctuation finale (la phrase met la sienne) ; `null` quand il ne reste rien.
export function toSlotTitle(title: string | null | undefined): string | null {
  const cleaned = (title ?? "").replace(/[\s.!?…]+$/u, "").trim();
  return cleaned === "" ? null : cleaned;
}

// Le prochain slot : le plus proche dans le futur (strictement), ou `null`.
export function toNextSlot(slots: readonly Slot[], now: number): Slot | null {
  let next: Slot | null = null;
  for (const slot of slots) if (slot.start > now && (next === null || slot.start < next.start)) next = slot;
  return next;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;
const DAY_MS = 86_400_000;
const NEXT_DAYS = 6;

// Le début du jour du calendrier local : deux instants du même jour s'y retrouvent.
const toStartOfDay = (at: number): Date => {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

// « aujourd'hui », « demain », le nom du jour dans les 6 jours (« jeudi »), sinon « le 23 octobre » (« le 1er novembre ») ; par
// jour du calendrier local.
export function toDayText(start: number, now: number): string {
  const day = toStartOfDay(start);
  const days = Math.round((day.getTime() - toStartOfDay(now).getTime()) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days <= NEXT_DAYS) return WEEKDAYS[day.getDay()] ?? "";
  const date = day.getDate();
  return `le ${date === 1 ? "1er" : date} ${MONTHS[day.getMonth()]}`;
}

const SLOT_PHRASE = "Prochain live : {jour} à {heure}. Au programme : {titre}.";
const UNTITLED_SLOT_PHRASE = "Prochain live : {jour} à {heure}.";

// « Prochain live : jeudi à 20 heures. Au programme : Soirée jeux. » ; sans titre, sans la dernière phrase.
export function toSlotText({ start, title }: Slot, now: number): string {
  const values = {
    jour: toDayText(start, now),
    heure: toSpokenClock(start),
    ...(title === null ? {} : { titre: title }),
  };
  const phrase = [SLOT_PHRASE, UNTITLED_SLOT_PHRASE].find((candidate) => isFillable(candidate, values));
  return toFilledPhrase(phrase ?? UNTITLED_SLOT_PHRASE, values);
}
