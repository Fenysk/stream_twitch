import { defineHandler } from "nitro";
import { isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/sounds/stop : « Couper le son ». Le son en cours s'arrête dans la page /sounds et la queue se vide.
export default defineHandler((event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(event.req)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  getRuntime().soundQueue.stop();
  return json({ stopped: true });
});
