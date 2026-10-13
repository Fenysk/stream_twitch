import { defineHandler } from "nitro";
import { isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/twitch/disconnect : le bouton « Se déconnecter » efface le jeton et arrête d'écouter les follows. Le corps JSON
// déclaré est exigé, comme pour les réglages : une page d'un autre site ne peut pas le poser sans l'accord du navigateur.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(event.req)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const { twitch } = getRuntime();
  await twitch.disconnect();
  return json(twitch.getStatus());
});
