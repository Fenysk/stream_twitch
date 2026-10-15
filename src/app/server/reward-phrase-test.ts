import { defineHandler } from "nitro";
import { isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/reward-phrases/:id/test : « Tester ». Une phrase de la récompense est dite tout de suite, avec Fenysk pour {user} ;
// la réponse rend l'adresse du WAV, comme « Faire parler ». Le corps JSON déclaré est exigé, comme pour les autres écritures.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(event.req)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const result = await getRuntime().foxReward.test(String(event.context.params?.id ?? ""));
  return result.ok ? json({ url: result.url }) : refuse(result.status, result.message);
});
