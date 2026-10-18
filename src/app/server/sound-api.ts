import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";
import { getSoundDraft } from "./sound-draft";

// Un sound : GET le donne avec qui l'utilise, PUT le modifie (le fichier audio est facultatif), DELETE le supprime. Aucun des trois
// ne parle à Twitch : supprimer un sound laisse ses rewards où ils sont.
export default defineHandler(async (event) => {
  const { sounds } = getRuntime();
  const request = event.req;
  const id = String(event.context.params?.id ?? "");
  if (request.method === "GET") {
    const sound = sounds.list().find((candidate) => candidate.id === id);
    return sound ? json(sound) : refuse(404, "son introuvable");
  }
  if (request.method === "DELETE") {
    const result = await sounds.delete(id);
    return result.ok ? json({ deleted: id }) : json({ issues: result.issues }, result.status);
  }
  if (request.method !== "PUT") return refuse(405, "méthode non permise");
  const draft = await getSoundDraft(request);
  if (draft instanceof Response) return draft;
  const result = sounds.update(id, draft);
  return result.ok ? json(result.value) : json({ issues: result.issues }, result.status);
});
