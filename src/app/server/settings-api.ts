import { defineHandler } from "nitro";
import { toSettingsView } from "../../domain/settings.rules";
import { SettingsChangesSchema, type SettingsIssue } from "../../domain/settings.schema";
import type { SettingsUpdate } from "../../usecase/settings.usecase";
import { getBodyJson, isJson, json } from "./http";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

const refuseSettings = (status: number, issues: SettingsIssue[]): Response => json({ issues }, status);

const toResponse = (update: SettingsUpdate): Response =>
  update.ok ? json(toSettingsView(update.state)) : refuseSettings(422, update.issues);

// L'API des réglages : GET les lit, PUT en change, DELETE revient aux valeurs par défaut.
export default defineHandler(async (event) => {
  const { settings } = getRuntime();
  const request = event.req;
  if (request.method === "GET") return json(toSettingsView(settings.getState()));
  if (request.method === "DELETE") {
    const update = settings.reset();
    if (update.ok) log("Réglages : valeurs par défaut rétablies, settings.local.json supprimé.");
    return toResponse(update);
  }
  if (request.method !== "PUT") return refuseSettings(405, [{ path: "", message: "méthode non permise" }]);
  if (!isJson(request)) {
    return refuseSettings(415, [
      { path: "", message: "le corps doit être du JSON (content-type: application/json)" },
    ]);
  }
  const parsed = SettingsChangesSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) {
    return refuseSettings(400, [
      { path: "", message: 'le corps doit être { "changes": { réglage: valeur ou null } }' },
    ]);
  }
  const update = settings.update(parsed.data.changes);
  if (update.ok) log(`Réglages changés : ${Object.keys(parsed.data.changes).join(", ")}.`);
  return toResponse(update);
});
