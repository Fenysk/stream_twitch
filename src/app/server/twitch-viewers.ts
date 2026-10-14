import { defineHandler } from "nitro";
import { json } from "./http";
import { getRuntime } from "./runtime";

// GET /api/twitch/viewers : le nombre de viewers du live (zéro compris), ou live hors ligne, ou nombre inconnu (Twitch n'a pas
// répondu, ou pas d'identifiants).
export default defineHandler(() => json(getRuntime().viewers.getState()));
