import { defineHandler } from "nitro";
import { ConfirmRequestSchema } from "../../domain/clip.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// « Enregistrer » sur un clip confirmé : titre et phrase seuls réécrivent son JSON ; un autre début ou une autre fin le recodent depuis
// son clip brut de Traités (~1 min pour 2 minutes). Comme à la validation : 409 si un clip est déjà en cours de traitement.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = ConfirmRequestSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) {
    return refuse(400, 'le corps doit être { "name", "title", "phrase", "start", "end" }');
  }
  const done = await getRuntime().clips.revise(parsed.data);
  return done.ok ? json(done.value) : refuse(done.status, done.message);
});
