import { defineHandler } from "nitro";
import { RewardPhrasesInputSchema } from "../../domain/reward-phrase.schema";
import { toIssuesMessage } from "../../shared/zod-issues";
import { getBodyJson, isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// PUT /api/reward-phrases/:id : remplace les phrases de la récompense (`{ "phrases": ["…"] }`), une liste vide les retire.
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "PUT") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const parsed = RewardPhrasesInputSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) return refuse(400, toIssuesMessage(parsed.error));
  const id = String(event.context.params?.id ?? "");
  const result = await getRuntime().rewardPhrases.update(id, parsed.data.phrases);
  return result.ok ? json({ phrases: result.value }) : json({ issues: result.issues }, result.status);
});
