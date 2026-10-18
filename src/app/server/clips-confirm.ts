import { defineHandler } from "nitro";
import { ConfirmRequestSchema } from "../../domain/clip.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// « Valider » : recode la partie choisie du clip brut vers Confirmés (~1 min pour 2 minutes), avec son titre et les phrases de début et de
// fin de Jean-Renard, puis range le clip brut dans Traités. La réponse n'arrive qu'à la fin ; en cas d'échec le clip brut ne bouge pas.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = ConfirmRequestSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) {
    return refuse(400, 'le corps doit être { "name", "title", "phrase", "endPhrase", "start", "end" }');
  }
  const done = await getRuntime().clips.confirm(parsed.data);
  return done.ok ? json(done.value) : refuse(done.status, done.message);
});
