// Les lignes d'état de la page Direct : ce que chaque carte dit en une ligne, et son ton. L'état se lit au texte ; le ton
// (bon, neutre, alerte) n'ajoute que la couleur d'un texte déjà écrit.

import { END_SOON_MINUTES, type EndStatus } from "../../domain/hours.rules";
import type { TwitchStatus } from "../../domain/twitch.schema";
import type { ViewersState } from "../../domain/viewers.types";
import { DESIGN_TEXTS } from "../design/design-texts";
import { toTwitchStatusText } from "./twitch-status-text";

export type Tone = "good" | "neutral" | "warning";

// `help` : une phrase dessous, quand l'état demande qu'on dise pourquoi ou où.
export type StateLine = { text: string; tone: Tone; help?: string };

const LOADING: StateLine = { text: DESIGN_TEXTS.loading, tone: "neutral" };

export const toViewersLine = (state: ViewersState | null): StateLine => {
  if (state === null) return LOADING;
  switch (state.kind) {
    case "live":
      return { text: `${state.count} viewer${state.count > 1 ? "s" : ""}`, tone: "good" };
    case "offline":
      return { text: "Hors ligne", tone: "neutral", help: "Le live n'est pas en cours." };
    case "unknown":
      return {
        text: "Inconnu",
        tone: "warning",
        help: "Twitch n'a pas répondu, ou les identifiants de l'application manquent dans .env.",
      };
  }
};

export const toTwitchLine = (status: TwitchStatus | null): StateLine => {
  if (status === null) return LOADING;
  const text = toTwitchStatusText(status);
  if (status.kind !== "connected") return { text, tone: "warning" };
  if (status.missing.length === 0) return { text, tone: "good" };
  return {
    text,
    tone: "warning",
    help: "Reconnecte-toi dans l'onglet Twitch : l'autorisation ne couvre pas tout.",
  };
};

// `isOpen` : une page /fox est connectée (la source OBS), elle fait le son et l'aperçu reste muet.
export const toFoxSourceLine = (isOpen: boolean): StateLine =>
  isOpen
    ? { text: "Source OBS ouverte", tone: "good", help: "Le son sort d'OBS." }
    : { text: "Source OBS non ouverte", tone: "neutral", help: "Le son sort de cette page." };

const MINUTE_MS = 60_000;

// « 12 min », « 1 h 12 » : une durée à la minute.
const toDurationText = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

// « 23 h 00 », « 9 h 05 » : l'heure locale d'un instant.
const toClockText = (at: number): string => {
  const date = new Date(at);
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, "0")}`;
};

// La fin prévue : alerte à 15 min d'elle et moins, et une fois dépassée. Le temps à venir s'arrondit à la minute au-dessus
// (30 s : « 1 min »), le dépassement à la minute en dessous.
export const toEndLine = (status: EndStatus): StateLine => {
  switch (status.kind) {
    case "none":
      return { text: "Pas de fin prévue", tone: "neutral" };
    case "upcoming": {
      const minutes = Math.ceil(status.remaining / MINUTE_MS);
      return {
        text: `Fin à ${toClockText(status.end)}, dans ${toDurationText(minutes)}`,
        tone: minutes <= END_SOON_MINUTES ? "warning" : "neutral",
      };
    }
    case "overtime": {
      const minutes = Math.floor(status.elapsed / MINUTE_MS);
      return {
        text: minutes === 0 ? "Fin dépassée de moins d'1 min" : `Fin dépassée de ${toDurationText(minutes)}`,
        tone: "warning",
      };
    }
  }
};
