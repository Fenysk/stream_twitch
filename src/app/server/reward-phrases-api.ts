import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// GET /api/reward-phrases : toutes les récompenses de la chaîne avec leurs phrases de Jean-Renard, puis celles qui ont disparu de
// Twitch et en gardent. Twitch injoignable ou connexion pas prête : le refus, en français.
export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return refuse(405, "méthode non permise");
  const result = await getRuntime().rewardPhrases.list();
  return result.ok ? json({ rewards: result.value }) : json({ issues: result.issues }, result.status);
});
