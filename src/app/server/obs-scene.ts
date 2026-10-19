import { defineHandler } from "nitro";
import { SceneRequestSchema } from "../../domain/control.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/obs/scene (`{ name }`) : la touche d'une scène de la régie passe cette scène à l'antenne. 409 quand OBS refuse (non joint,
// scène inconnue).
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, SceneRequestSchema);
  if (request instanceof Response) return request;
  const result = await getRuntime().control.updateScene(request.name);
  return result.ok ? json({}) : refuse(result.status, result.message);
});
