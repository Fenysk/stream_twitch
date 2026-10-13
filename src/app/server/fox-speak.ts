import { defineHandler } from "nitro";
import { SpeakRequestSchema } from "../../domain/fox.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// « Faire parler » : le texte part en synthèse, le WAV part aux pages (l'aperçu et OBS) ; la réponse rend son adresse. Le
// renard revient s'il était parti, et la voix d'Alexis ne l'arrête pas.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = SpeakRequestSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) return refuse(400, 'le corps doit être { "text": "…" }');
  const result = await getRuntime().mode.say(parsed.data.text);
  return result.ok ? json({ url: result.url }) : refuse(result.status, result.message);
});
