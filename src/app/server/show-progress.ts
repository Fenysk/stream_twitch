import { defineHandler } from "nitro";
import { ShowProgressSchema } from "../../domain/show.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// La page `/show` dit où elle en est : son temps (ouverture, carton, clip, clôture) et le clip, ou `ended` quand l'émission est finie.
// 409 quand elle parle d'une autre émission que la courante : elle s'est arrêtée entre-temps.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = ShowProgressSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) return refuse(400, 'le corps doit être { "runId": "…", "phase": "…", "index": 0 }');
  const reported = getRuntime().director.report(parsed.data);
  return reported.ok ? json({}) : refuse(reported.status, reported.message);
});
