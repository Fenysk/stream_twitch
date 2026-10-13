import { defineHandler } from "nitro";
import { refuse } from "./http";
import { getRuntime } from "./runtime";

// GET /auth/twitch/start : le bouton « Se connecter à Twitch » de l'onglet Renard ouvre cette adresse, qui renvoie Alexis vers la
// page d'autorisation de Twitch (avec un state neuf, qui reviendra au retour).
export default defineHandler(() => {
  const result = getRuntime().twitch.beginLogin();
  if (!result.ok) return refuse(503, result.message);
  return new Response(null, { status: 302, headers: { location: result.url, "cache-control": "no-store" } });
});
