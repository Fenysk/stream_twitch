import { defineHandler } from "nitro";
import { getExpressionDraft } from "./expression-draft";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

// La liste des expressions (GET) et la création d'une expression (POST).
export default defineHandler(async (event) => {
  const { expressions } = getRuntime();
  const request = event.req;
  if (request.method === "GET") return json({ expressions: expressions.list() });
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  const draft = await getExpressionDraft(request);
  if (draft instanceof Response) return draft;
  const result = expressions.create(draft);
  if (!result.ok) return json({ issues: result.issues }, result.status);
  log(`Expression « ${result.value.name} » créée (${result.value.id}).`);
  return json(result.value, 201);
});
