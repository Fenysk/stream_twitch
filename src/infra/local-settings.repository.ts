import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { toLegacyEndAt } from "../domain/hours.rules";
import { toInstantText } from "../domain/instant.rules";
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
const writeAtomically = (path: string, json: unknown): void => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(json, null, 2)}\n`);
  renameSync(temporary, path);
};

export function updateLocalSettings(path: string, local: LocalSettings): void {
  writeAtomically(path, local);
}

const LEGACY_END_KEY = "foxEndTime";

// L'ancienne fin « HH:MM » (foxEndTime) devient un instant (foxEndAt) dans le fichier même : relue plus tard, la même heure
// ne donnerait plus le même jour. Avant `getLocalSettings`, jamais fatal (il signale un fichier illisible).
export function upgradeLocalSettings(path: string, now: number, log: (message: string) => void): void {
  if (!existsSync(path)) return;
  try {
    const json = getJsonFile(path);
    if (typeof json !== "object" || json === null || Array.isArray(json) || !(LEGACY_END_KEY in json)) return;
    const { [LEGACY_END_KEY]: legacy, ...kept } = Object.fromEntries(Object.entries(json));
    const endAt =
      typeof legacy === "string" && kept.foxEndAt === undefined ? toLegacyEndAt(legacy, now) : null;
    writeAtomically(path, endAt === null ? kept : { ...kept, foxEndAt: toInstantText(endAt) });
    log(
      endAt === null
        ? `settings.local.json : ${LEGACY_END_KEY} retiré, aucune fin prévue à convertir.`
        : `settings.local.json : ${LEGACY_END_KEY} « ${String(legacy)} » devient foxEndAt ${toInstantText(endAt)}.`,
    );
  } catch (error) {
    log(
      `settings.local.json : ${LEGACY_END_KEY} n'a pas pu être converti en foxEndAt, ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function deleteLocalSettings(path: string): void {
  rmSync(path, { force: true });
}
