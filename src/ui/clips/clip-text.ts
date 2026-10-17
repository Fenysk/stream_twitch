// Les textes de l'onglet Émission : une durée en minutes et secondes, une date de clip, où en est l'émission.

import type { ShowState } from "../../domain/show.schema";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// « 1:59 » pour 118,55 s ; « 1:02:03 » à partir d'une heure ; une durée que ffprobe n'a pas lue est dite telle quelle.
export const toDurationText = (seconds: number | null): string => {
  if (seconds === null) return "durée inconnue";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / SECONDS_PER_HOUR);
  const minutes = Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secondsPart = String(whole % SECONDS_PER_MINUTE).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}`
    : `${minutes}:${secondsPart}`;
};

// Un instant du clip au centième : « 0:12.50 », « 1:58.55 ».
export const toTimecodeText = (seconds: number): string => {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  const whole = Math.floor(hundredths / 100);
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const secondsPart = String(whole % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${minutes}:${secondsPart}.${String(hundredths % 100).padStart(2, "0")}`;
};

// « Rire 2 sur 3 · à 0:12.50 » : le rang du rire choisi parmi tous les rires, et son instant.
export const toLaughRankText = (rank: number, count: number, at: number): string =>
  `Rire ${rank} sur ${count} · à ${toTimecodeText(at)}`;

// « 15 oct. 2026, 15:09 » : la date de sauvegarde du clip, à l'heure de la machine (ou du `timeZone` donné).
export const toClipDateText = (modifiedAt: number, timeZone?: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  })
    .format(modifiedAt)
    .replace(" à ", ", ");

// Où en est l'émission, pour l'onglet : arrêtée, en cours (son temps, ou « clip 2 sur 5 »), ou finie alors que sa source reste visible.
export const toShowStatusText = ({ status, phase, index, lineup }: ShowState): string => {
  if (status === "idle") return "Émission arrêtée.";
  if (status === "over") return "Émission terminée. Cache puis remets la source pour la relancer.";
  if (phase === "opening") return "Émission en cours : ouverture.";
  if (phase === "closing") return "Émission en cours : clôture.";
  return `Émission en cours : clip ${index + 1} sur ${lineup.length}.`;
};

// « 16 octobre » pour 2026-10-16 ; l'année s'ajoute quand ce n'est pas celle de `now` (« 16 octobre 2025 »). Un jour illisible est dit tel quel.
export const toDayText = (day: string, now: number): string => {
  const parts = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(day);
  if (!parts) return day;
  const [year, month, date] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    ...(year === new Date(now).getUTCFullYear() ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, date));
};

// « 3 clips confirmés », « 1 clip confirmé », « Aucun clip confirmé ».
export const toConfirmedText = (count: number): string => {
  if (count === 0) return "Aucun clip confirmé.";
  return `${count} clip${count > 1 ? "s" : ""} confirmé${count > 1 ? "s" : ""}.`;
};
