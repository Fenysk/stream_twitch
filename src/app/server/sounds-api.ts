import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";
import { getSoundDraft } from "./sound-draft";

// La liste des sounds, avec qui les utilise (GET), et la création d'un sound (POST) : aucune des deux ne parle à Twitch.
export default defineHandler(async (event) => {
  const { sounds } = getRuntime();
  const request = event.req;
  if (request.method === "GET") return json({ sounds: sounds.list() });
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  const draft = await getSoundDraft(request);
  if (draft instanceof Response) return draft;
  const result = sounds.create(draft);
  return result.ok ? json(result.value, 201) : json({ issues: result.issues }, result.status);
});
