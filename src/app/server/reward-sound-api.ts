import { defineHandler } from "nitro";
import { RewardSoundInputSchema } from "../../domain/reward.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// PUT /api/rewards/:id/sound : choisit le sound de la récompense (`{ "sound": "ab12cd34" }`), `null` pour lui en retirer. Rien n'est
// écrit sur Twitch : seul data/rewards.json change.
export default defineHandler(async (event) => {
  if (event.req.method !== "PUT") return refuse(405, "méthode non permise");
  const input = await getBody(event.req, RewardSoundInputSchema);
  if (input instanceof Response) return input;
  const result = await getRuntime().rewards.updateSound(String(event.context.params?.id ?? ""), input.sound);
  return result.ok ? json({ sound: result.value }) : json({ issues: result.issues }, result.status);
});
