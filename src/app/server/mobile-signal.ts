import { defineHandler } from "nitro";
import { SignalRequestSchema } from "../../domain/phone.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/mobile/signal : un signal de mise en relation, du téléphone vers la page OBS de son numéro ou l'inverse. 404 quand
// l'envoyeur n'est pas (ou plus) connu : le serveur a redémarré, son flux se rouvre de lui-même.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, SignalRequestSchema);
  if (request instanceof Response) return request;
  const result = getRuntime().phones.relay(request);
  return result.ok ? json({ isDelivered: result.isDelivered }) : refuse(result.status, result.message);
});
