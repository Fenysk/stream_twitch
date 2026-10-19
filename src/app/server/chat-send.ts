import { defineHandler } from "nitro";
import { ChatSendRequestSchema } from "../../domain/control.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/chat/send (`{ text }`, 1 à 500 caractères) : « Écrire » dans la régie envoie le message dans le chat au nom d'Alexis, par
// l'API Helix de Twitch. 401 : le jeton n'a pas le droit d'écrire (il faut reconnecter Twitch) ou n'existe pas.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, ChatSendRequestSchema);
  if (request instanceof Response) return request;
  const result = await getRuntime().control.sendMessage(request.text);
  return result.ok ? json({ sent: true }) : refuse(result.status, result.message);
});
