import { defineHandler } from "nitro";
import { RewardFieldsSchema } from "../../domain/reward.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// Une récompense que l'app a créée : PUT modifie son titre, son coût et sa pace sur Twitch, DELETE la supprime (la queue rend
// d'abord les points de ses rachats en attente). Celle qu'Alexis a faite sur Twitch est refusée : elle se règle là-bas.
export default defineHandler(async (event) => {
  const { rewards } = getRuntime();
  const request = event.req;
  const id = String(event.context.params?.id ?? "");
  if (request.method === "DELETE") {
    const result = await rewards.delete(id);
    return result.ok ? json({ deleted: id }) : json({ issues: result.issues }, result.status);
  }
  if (request.method !== "PUT") return refuse(405, "méthode non permise");
  const fields = await getBody(request, RewardFieldsSchema);
  if (fields instanceof Response) return fields;
  const result = await rewards.update(id, fields);
  return result.ok ? json(result.value) : json({ issues: result.issues }, result.status);
});
