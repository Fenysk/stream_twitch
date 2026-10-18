import { defineHandler } from "nitro";
import { RewardCreationSchema } from "../../domain/reward.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// GET /api/rewards : les récompenses de la chaîne avec leur sound (`null` : aucun), puis celles que Twitch ne connaît plus.
// POST /api/rewards : crée une récompense sur Twitch (`{ title, cost, pace, sound? }`). Twitch injoignable ou connexion pas
// prête : le refus, en français.
export default defineHandler(async (event) => {
  const { rewards } = getRuntime();
  if (event.req.method === "GET") {
    const result = await rewards.list();
    return result.ok ? json({ rewards: result.value }) : json({ issues: result.issues }, result.status);
  }
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const draft = await getBody(event.req, RewardCreationSchema);
  if (draft instanceof Response) return draft;
  const result = await rewards.create(draft);
  return result.ok ? json(result.value, 201) : json({ issues: result.issues }, result.status);
});
