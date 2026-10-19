import { defineHandler } from "nitro";
import { LinkRequestSchema } from "../../domain/phone.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/mobile/link : un côté dit où en est la liaison d'une caméra. Le téléphone dit s'il filme, la page OBS de son numéro si sa
// liaison est vive : la régie n'offre l'image d'une caméra que si les deux le disent. 404 quand l'envoyeur n'est pas (ou plus) connu : le
// serveur a redémarré, son flux se rouvre de lui-même et il redit où il en est.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, LinkRequestSchema);
  if (request instanceof Response) return request;
  const result = getRuntime().phones.updateLink(request);
  return result.ok ? json({}) : refuse(result.status, result.message);
});
