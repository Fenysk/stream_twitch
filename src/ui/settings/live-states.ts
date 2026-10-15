// Les lignes d'état de la page Direct : ce que chaque carte dit en une ligne, et son ton. L'état se lit au texte ; le ton
// (bon, neutre, alerte) n'ajoute que la couleur d'un texte déjà écrit.

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
