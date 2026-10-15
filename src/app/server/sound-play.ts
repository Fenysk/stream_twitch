import { defineHandler } from "nitro";
import { isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/sounds/:id/play : « Jouer dans OBS ». Le son rejoint la queue et part à la page /sounds quand son tour vient.
// Le corps JSON déclaré est exigé, comme pour les autres écritures.
export default defineHandler((event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(event.req)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const result = getRuntime().soundQueue.play(String(event.context.params?.id ?? ""));
  return result.ok ? json({ queued: true }) : refuse(result.status, result.message);
});
