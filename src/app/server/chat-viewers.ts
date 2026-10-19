import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// GET /api/chat/viewers : la liste des viewers de la régie, les personnes connectées au chat de la chaîne, triées par pseudo (`{ viewers:
// [{ id, nickname }] }`), lue chez Twitch à chaque demande. 401 : le jeton n'a pas le droit de lire la liste (il faut reconnecter
// Twitch) ou n'existe pas.
export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return refuse(405, "méthode non permise");
  const result = await getRuntime().control.listChatViewers();
  return result.ok ? json({ viewers: result.chatViewers }) : refuse(result.status, result.message);
});
