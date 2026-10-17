import { defineHandler } from "nitro";
import { DiscardRequestSchema } from "../../domain/clip.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// « Retirer de l'émission » : la vidéo du clip confirmé, son JSON et son chat passent dans Traités ; le clip quitte la rotation de
// `/show`. Rien n'est supprimé du disque.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = DiscardRequestSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) return refuse(400, 'le corps doit être { "name": "…" }');
  const done = await getRuntime().clips.withdraw(parsed.data.name);
  return done.ok ? json(done.value) : refuse(done.status, done.message);
});
