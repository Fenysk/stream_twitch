import { toEffectiveSettings, toNextLocal } from "../domain/settings.rules";
import type { LocalSettings, Settings, SettingsChanges, SettingsIssue } from "../domain/settings.schema";

// Les valeurs par défaut (settings.json), les valeurs d'Alexis (settings.local.json), et celles qui s'appliquent.
export type SettingsState = { defaults: Settings; local: LocalSettings; effective: Settings };

// Le disque vu du usecase : infra l'implémente (écriture atomique) ; il peut lever une erreur.
export type SettingsPort = { updateLocal(local: LocalSettings): void; deleteLocal(): void };

export type SettingsStoreDeps = {
  defaults: Settings;
  local: LocalSettings;
  port: SettingsPort;
  onChange: (effective: Settings) => void;
  log: (message: string) => void;
};

export type SettingsUpdate = { ok: true; state: SettingsState } | { ok: false; issues: SettingsIssue[] };

export type SettingsStore = {
  getState(): SettingsState;
  update(changes: SettingsChanges): SettingsUpdate;
  reset(): SettingsUpdate;
};

const toDiskIssue = (error: unknown): SettingsIssue => ({
  path: "",
  message: `valeurs non enregistrées : ${error instanceof Error ? error.message : String(error)}`,
});

export function createSettingsStore({
  defaults,
  local,
  port,
  onChange,
  log,
}: SettingsStoreDeps): SettingsStore {
  let state: SettingsState = { defaults, local: {}, effective: defaults };

  // Des valeurs locales qui ne vont plus avec les valeurs par défaut (modifiées dans git depuis) ne bloquent pas le serveur :
  // elles sont ignorées, le fichier reste tel quel pour qu'Alexis le corrige.
  const start = toEffectiveSettings(defaults, local);
  if (start.ok) state = { defaults, local, effective: start.value };
  else {
    const problems = start.issues.map(({ path, message }) => `${path || "(règle)"} : ${message}`).join(" ; ");
    log(`settings.local.json ignoré, ses valeurs ne vont plus avec settings.json : ${problems}`);
  }

  const apply = (next: SettingsState): SettingsUpdate => {
    state = next;
    onChange(next.effective);
    return { ok: true, state };
  };

  return {
    getState: () => state,
    update(changes) {
      const nextLocal = toNextLocal(state.local, changes);
      if (!nextLocal.ok) return nextLocal;
      const effective = toEffectiveSettings(defaults, nextLocal.value);
      if (!effective.ok) return effective;
      try {
        if (Object.keys(nextLocal.value).length === 0) port.deleteLocal();
        else port.updateLocal(nextLocal.value);
      } catch (error) {
        return { ok: false, issues: [toDiskIssue(error)] };
      }
      return apply({ defaults, local: nextLocal.value, effective: effective.value });
    },
    reset() {
      try {
        port.deleteLocal();
      } catch (error) {
        return { ok: false, issues: [toDiskIssue(error)] };
      }
      return apply({ defaults, local: {}, effective: defaults });
    },
  };
}
