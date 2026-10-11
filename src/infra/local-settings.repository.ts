import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { type LocalSettings, LocalSettingsSchema } from "../domain/settings.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import { getJsonFile } from "./json-file.gateway";

const EDITABLE_KEYS: ReadonlySet<string> = new Set(Object.keys(LocalSettingsSchema.shape));

// Seuls les réglages de l'interface se lisent ici ; les autres clés (d'une ancienne version, ou écrites à la main) sont mises de côté.
const sortEditable = (json: unknown): { kept: unknown; ignored: string[] } => {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { kept: json, ignored: [] };
  const entries = Object.entries(json);
  return {
    kept: Object.fromEntries(entries.filter(([key]) => EDITABLE_KEYS.has(key))),
    ignored: entries.map(([key]) => key).filter((key) => !EDITABLE_KEYS.has(key)),
  };
};

// Les valeurs d'Alexis (settings.local.json) : le serveur ne s'arrête jamais pour elles. Une clé qui n'est pas un des
// réglages de l'interface est ignorée et signalée ; un fichier abîmé est ignoré tout entier, et signalé.
export function getLocalSettings(path: string, log: (message: string) => void): LocalSettings {
  if (!existsSync(path)) return {};
  try {
    const { kept, ignored } = sortEditable(getJsonFile(path));
    if (ignored.length > 0) {
      log(
        `settings.local.json : ${ignored.join(", ")} ignoré(s), ces réglages ne se changent pas ici (ils restent dans settings.json)`,
      );
    }
    const parsed = LocalSettingsSchema.safeParse(kept);
    if (parsed.success) return parsed.data;
    log(`settings.local.json ignoré : ${toIssuesMessage(parsed.error)}`);
  } catch (error) {
    log(`settings.local.json ignoré : ${error instanceof Error ? error.message : String(error)}`);
  }
  return {};
}

// Écriture atomique : le fichier temporaire est écrit en entier, puis renommé par-dessus l'ancien. Une coupure ne laisse
// jamais un fichier à moitié écrit.
export function updateLocalSettings(path: string, local: LocalSettings): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(local, null, 2)}\n`);
  renameSync(temporary, path);
}

export function deleteLocalSettings(path: string): void {
  rmSync(path, { force: true });
}
