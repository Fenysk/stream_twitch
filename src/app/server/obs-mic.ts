import { defineHandler } from "nitro";
import { MicRequestSchema } from "../../domain/control.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/obs/mic (`{ id }`, `pc` ou `camera-3`) : la touche d'un micro de la régie l'ouvre dans OBS et coupe tous les autres ; la tête
// et Jean-Renard écoutent alors celui-là. 404 : micro inconnu ; 409 : OBS refuse, ou l'entrée n'existe pas.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, MicRequestSchema);
  if (request instanceof Response) return request;
  const result = await getRuntime().control.updateMic(request.id);
  return result.ok ? json({}) : refuse(result.status, result.message);
});
