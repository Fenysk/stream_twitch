import { defineHandler } from "nitro";
import { json } from "./http";
import { getRuntime } from "./runtime";

// GET /api/twitch/status : l'état de la connexion à Twitch pour l'onglet Twitch (indisponible, déconnecté avec la raison du
// dernier échec, ou connecté avec le compte). Jamais le jeton.
export default defineHandler(() => json(getRuntime().twitch.getStatus()));
