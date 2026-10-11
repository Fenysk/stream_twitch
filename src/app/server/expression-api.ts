import { defineHandler } from "nitro";
import { getExpressionDraft } from "./expression-draft";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

// Une expression : GET la rouvre (sa géométrie), PUT la met à jour, DELETE la supprime.
export default defineHandler(async (event) => {
  const { expressions } = getRuntime();
  const request = event.req;
  const id = String(event.context.params?.id ?? "");
  if (request.method === "GET") {
    const detail = expressions.getDetail(id);
    return detail ? json(detail) : refuse(404, "expression introuvable");
  }
  if (request.method === "DELETE") {
    const result = expressions.delete(id);
    if (!result.ok) return json({ issues: result.issues }, result.status);
    log(`Expression ${id} supprimée.`);
    return json({ deleted: id });
  }
  if (request.method !== "PUT") return refuse(405, "méthode non permise");
  const draft = await getExpressionDraft(request);
  if (draft instanceof Response) return draft;
  const result = expressions.update(id, draft);
  if (!result.ok) return json({ issues: result.issues }, result.status);
  log(`Expression « ${result.value.name} » mise à jour (${id}).`);
  return json(result.value);
});
