// Ce que la page dit de la connexion à Twitch en une ligne : le bloc de l'onglet Twitch et la page Direct la reprennent.

import type { TwitchStatus } from "../../domain/twitch.schema";
import { DESIGN_TEXTS } from "../design/design-texts";

export const toTwitchStatusText = (status: TwitchStatus | null): string => {
  if (status === null) return DESIGN_TEXTS.loading;
  switch (status.kind) {
    case "unavailable":
      return "Indisponible : TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env.";
    case "connected":
      return `Connecté en tant que ${status.login}.`;
    case "disconnected":
      return "Non connecté.";
  }
};
