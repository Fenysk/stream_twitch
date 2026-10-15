import type { TwitchStatus } from "../../domain/twitch.schema";

// Ce que l'onglet « Points de chaîne » dit de la connexion à Twitch quand elle ne permet pas encore de gérer les rewards ;
// `null` : elle le permet (ou l'état n'est pas encore lu).
export const toTwitchHint = (status: TwitchStatus | null): string | null => {
  switch (status?.kind) {
    case "unavailable":
      return "Twitch est indisponible : TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env.";
    case "disconnected":
      return "Twitch n'est pas connecté : connecte-le dans l'onglet Renard pour créer les récompenses des sons.";
    case "connected":
      return status.missing.includes("reward")
        ? "Il manque le droit de gérer les récompenses à la connexion Twitch : reconnecte-toi dans l'onglet Renard."
        : null;
    default:
      return null;
  }
};
