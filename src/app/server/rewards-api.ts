import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// GET /api/rewards : les récompenses de la chaîne qui n'ont pas encore de son (pour en relier une), et les sons dont la
// récompense a disparu de Twitch. Twitch injoignable ou connexion pas prête : le refus, en français.
export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return refuse(405, "méthode non permise");
  const result = await getRuntime().sounds.listRewards();
  return result.ok ? json(result.value) : json({ issues: result.issues }, result.status);
});
