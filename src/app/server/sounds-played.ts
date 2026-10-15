import { defineHandler } from "nitro";
import { SoundOutcomeSchema } from "../../domain/sound.schema";
import { toIssuesMessage } from "../../shared/zod-issues";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/sounds/played : la page /sounds dit qu'un son a fini (`ended`) ou n'a pas pu jouer (`failed`, avec la raison).
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(event.req)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = SoundOutcomeSchema.safeParse(await getBodyJson(event.req));
  if (!parsed.success) return refuse(400, toIssuesMessage(parsed.error));
  getRuntime().soundQueue.finish(parsed.data.playId, parsed.data.outcome, parsed.data.reason);
  return json({ received: true });
});
