import { defineHandler } from "nitro";
import { toSettingsView } from "../../domain/settings.rules";
import { SettingsChangesSchema, type SettingsIssue } from "../../domain/settings.schema";
import type { SettingsUpdate } from "../../usecase/settings.usecase";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const refuse = (status: number, issues: SettingsIssue[]): Response => json({ issues }, status);

const toResponse = (update: SettingsUpdate): Response =>
  update.ok ? json(toSettingsView(update.state)) : refuse(422, update.issues);

// Lire un corps JSON sans lever : un corps illisible est une demande refusée, pas une panne du serveur.
const getChanges = async (request: Request) => {
  try {
    return SettingsChangesSchema.safeParse(await request.json());
  } catch {
    return undefined;
  }
};

// L'API des réglages : GET les lit, PUT en change, DELETE revient aux valeurs par défaut.
// Un corps JSON déclaré est exigé : une page d'un autre site ne peut pas le poser sans l'accord (CORS) du navigateur.
export default defineHandler(async (event) => {
  const { settings } = getRuntime();
  const request = event.req;
  if (request.method === "GET") return json(toSettingsView(settings.getState()));
  if (request.method === "DELETE") {
    const update = settings.reset();
    if (update.ok) log("Réglages : valeurs par défaut rétablies, settings.local.json supprimé.");
    return toResponse(update);
  }
  if (request.method !== "PUT") return refuse(405, [{ path: "", message: "méthode non permise" }]);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return refuse(415, [
      { path: "", message: "le corps doit être du JSON (content-type: application/json)" },
    ]);
  }
  const parsed = await getChanges(request);
  if (!parsed?.success) {
    return refuse(400, [
      { path: "", message: 'le corps doit être { "changes": { réglage: valeur ou null } }' },
    ]);
  }
  const update = settings.update(parsed.data.changes);
  if (update.ok) log(`Réglages changés : ${Object.keys(parsed.data.changes).join(", ")}.`);
  return toResponse(update);
});
