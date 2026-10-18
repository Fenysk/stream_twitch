import { defineHandler } from "nitro";
import { ShowSpeakRequestSchema } from "../../domain/show.schema";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// Fait dire à Jean-Renard une phrase de l'émission, dans `/show` : la page dit laquelle (l'ouverture, la clôture, la phrase de début ou
// de fin du clip n° `index`), le serveur choisit ou lit le texte. La réponse arrive quand la voix part, avec la durée de la phrase (ms) ;
// 0 quand il n'y a rien à dire. 409 quand l'émission n'est plus la courante.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = ShowSpeakRequestSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) {
    return refuse(
      400,
      'le corps doit être { "runId": "…", "kind": "opening" | "closing" | "clip" | "clipEnd", "index": 0 }',
    );
  }
  const spoken = await getRuntime().director.speak(parsed.data);
  return spoken.ok ? json({ durationMs: spoken.durationMs }) : refuse(spoken.status, spoken.message);
});
