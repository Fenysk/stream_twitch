import type { z } from "zod";
import {
  type EditableSettings,
  type LocalSettings,
  LocalSettingsSchema,
  type Settings,
  type SettingsChanges,
  SettingsFieldsSchema,
  type SettingsIssue,
  SettingsSchema,
  type SettingsView,
} from "./settings.schema";

export type SettingsResult<Value> = { ok: true; value: Value } | { ok: false; issues: SettingsIssue[] };

const SETTINGS_KEYS: ReadonlySet<string> = new Set(Object.keys(SettingsFieldsSchema.shape));

// Une clé refusée ne dit pas « Unrecognized key » : l'interface lit ce message, et le réglage fautif y est nommé.
// Un réglage qui existe mais que l'interface ne change pas (le micro, le délai…) reste dans settings.json.
const toIssues = (error: z.ZodError): SettingsIssue[] =>
  error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => ({
          path: key,
          message: SETTINGS_KEYS.has(key)
            ? "ce réglage ne se change pas ici, il reste dans settings.json"
            : "réglage inconnu",
        }))
      : [{ path: issue.path.join("."), message: issue.message }],
  );

const withoutUndefined = (local: LocalSettings): LocalSettings =>
  Object.fromEntries(Object.entries(local).filter(([, value]) => value !== undefined));

// Les valeurs par défaut, puis celles d'Alexis par-dessus ; les règles entre réglages valent pour le tout.
export function toEffectiveSettings(defaults: Settings, local: LocalSettings): SettingsResult<Settings> {
  const parsed = SettingsSchema.safeParse({ ...defaults, ...withoutUndefined(local) });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: toIssues(parsed.error) };
}

// `null` retire le réglage local : il reprend sa valeur par défaut. L'objet reçu n'est jamais modifié.
export function toNextLocal(local: LocalSettings, changes: SettingsChanges): SettingsResult<LocalSettings> {
  const merged: Record<string, unknown> = { ...local };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  const parsed = LocalSettingsSchema.safeParse(merged);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: toIssues(parsed.error) };
}

const toEditable = ({
  threshold,
  tilt,
  opening,
  voiceEffect,
  idleAngle,
  talkAngle,
  expression,
}: Settings): EditableSettings => ({
  threshold,
  ...(tilt === undefined ? {} : { tilt }),
  ...(opening === undefined ? {} : { opening }),
  ...(voiceEffect === undefined ? {} : { voiceEffect }),
  ...(idleAngle === undefined ? {} : { idleAngle }),
  ...(talkAngle === undefined ? {} : { talkAngle }),
  ...(expression === undefined ? {} : { expression }),
});

// Ce que l'interface voit : ses réglages seulement.
export function toSettingsView(state: {
  defaults: Settings;
  local: LocalSettings;
  effective: Settings;
}): SettingsView {
  return {
    defaults: toEditable(state.defaults),
    local: state.local,
    effective: toEditable(state.effective),
  };
}
