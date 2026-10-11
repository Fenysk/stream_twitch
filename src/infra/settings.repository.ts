import { type Settings, SettingsSchema } from "../domain/settings.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import { getJsonFile } from "./json-file.gateway";

export function getSettings(path: string): Settings {
  const parsed = SettingsSchema.safeParse(getJsonFile(path));
  if (!parsed.success) throw new Error(`settings.json invalide : ${toIssuesMessage(parsed.error)}`);
  return parsed.data;
}
