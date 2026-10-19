import { defineHandler } from "nitro";
import { EndRequestSchema } from "../../domain/control.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/fox/end (`{ direction: "later" | "sooner" }`) : un cran sur la fin prévue du live, comme les touches « Fin du live » du
// Stream Deck (`foxEndAt`, de dix minutes en dix minutes, avec l'heure du serveur).
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, EndRequestSchema);
  if (request instanceof Response) return request;
  const result = getRuntime().control.updateEnd(request.direction);
  return result.ok ? json({}) : refuse(result.status, result.message);
});
