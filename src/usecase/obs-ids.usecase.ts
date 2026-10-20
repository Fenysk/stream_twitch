import {
  type ObsIdentity,
  type ObsKind,
  type ObsNames,
  type ObsRenamed,
  type ObsResolution,
  toAlignedRecord,
  toConfiguredName,
  toObsKind,
  toObsLine,
  toRenamedRecord,
  toResolution,
  toStartName,
} from "../domain/obs-ids.rules";
import { OBS_NAME_KEYS, type ObsIdRecord, type ObsIdsFile, type ObsNameKey } from "../domain/obs-ids.schema";
import type { Settings } from "../domain/settings.schema";

// OBS vu du suivi ; infra l'implémente avec obs-websocket (GetInputList, GetSceneList, InputNameChanged, SceneNameChanged). Une lecture
// en échec (OBS non joint, trop ancien pour donner les identifiants) lève une erreur.
export type ObsIdsSource = {
  listInputIdentities(): Promise<ObsIdentity[]>;
  listSceneIdentities(): Promise<ObsIdentity[]>;
  onRenamed(listener: (renamed: ObsRenamed) => void): void;
};

// Le fichier des identifiants retenus (data/obs-ids.json) ; `get` rend `undefined` quand il n'existe pas encore. `update` peut lever
// une erreur (disque).
export type ObsIdsStore = { get(): ObsIdsFile | undefined; update(file: ObsIdsFile): void };

// Les réglages que le suivi lit : le nom de chaque entrée et scène qu'ils désignent.
export type ObsIdsSettings = Pick<Settings, ObsNameKey>;

// Le nom d'OBS d'un réglage change (`to` absent : le réglage ne nomme plus rien).
export type ObsNameChange = { key: ObsNameKey; from: string | undefined; to: string | undefined };

export type ObsIdsDeps = {
  source: ObsIdsSource;
  store: ObsIdsStore;
  settings: ObsIdsSettings;
  log: (message: string) => void;
};

export type ObsIds = {
  // Le nom d'OBS à utiliser pour chaque réglage : le dernier connu avant qu'OBS réponde, puis celui qu'OBS donne.
  getNames(): ObsNames;
  // Les réglages changent : un nom changé à la main l'emporte, et sa source est retenue à nouveau.
  update(settings: ObsIdsSettings): void;
  // OBS vient d'être joint : les identifiants retenus sont relus, les sources renommées ou supprimées depuis rattrapées. Une lecture
  // d'OBS en échec est dite au journal, jamais levée.
  resolve(): Promise<void>;
  // Chaque nom d'OBS qui change, tant qu'on écoute.
  subscribe(listener: (change: ObsNameChange) => void): () => void;
};

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Un réglage et le nom qu'il porte.
type Wanted = { key: ObsNameKey; name: string };

export function createObsIds({ source, store, settings, log }: ObsIdsDeps): ObsIds {
  // Pour chaque réglage qui nomme une source : son nom, la source retenue, et le nom d'OBS à utiliser.
  const configured = new Map<ObsNameKey, string>();
  const records = new Map<ObsNameKey, ObsIdRecord>();
  const names = new Map<ObsNameKey, string>();
  const listeners = new Set<(change: ObsNameChange) => void>();
  let isUnreadableLogged = false;

  const file = store.get();
  for (const key of OBS_NAME_KEYS) {
    const name = toConfiguredName(settings[key]);
    if (name === undefined) continue;
    const record = file?.ids[key];
    configured.set(key, name);
    names.set(key, toStartName(name, record));
    if (record) records.set(key, record);
  }

  const toFileIds = (): ObsIdsFile["ids"] => {
    const ids: ObsIdsFile["ids"] = {};
    for (const [key, record] of records) ids[key] = record;
    return ids;
  };
  let saved = JSON.stringify(file?.ids ?? {});

  // Écrit le fichier s'il a changé ; un disque qui refuse n'arrête pas le suivi, le fichier sera réécrit au changement suivant.
  const persist = () => {
    const ids = toFileIds();
    const text = JSON.stringify(ids);
    if (text === saved) return;
    try {
      store.update({ ids });
      saved = text;
    } catch (error) {
      log(`Suivi d'OBS : identifiants non enregistrés (${toReason(error)}).`);
    }
  };

  const keep = (key: ObsNameKey, record: ObsIdRecord | undefined) => {
    if (record) records.set(key, record);
    else records.delete(key);
  };

  const emit = (key: ObsNameKey, to: string | undefined) => {
    const from = names.get(key);
    if (from === to) return;
    if (to === undefined) names.delete(key);
    else names.set(key, to);
    for (const listener of listeners) listener({ key, from, to });
  };

  const apply = (key: ObsNameKey, { name, record, event }: ObsResolution) => {
    keep(key, record);
    if (event) log(toObsLine(key, event, name));
    emit(key, name);
  };

  // Les entrées et les scènes d'OBS, seulement des genres dont un réglage a besoin ; `undefined` : OBS n'a pas répondu (dit une fois).
  const getListed = async (
    wanted: readonly Wanted[],
  ): Promise<Record<ObsKind, ObsIdentity[]> | undefined> => {
    const kinds = new Set(wanted.map(({ key }) => toObsKind(key)));
    try {
      const [input, scene] = await Promise.all([
        kinds.has("input") ? source.listInputIdentities() : [],
        kinds.has("scene") ? source.listSceneIdentities() : [],
      ]);
      isUnreadableLogged = false;
      return { input, scene };
    } catch (error) {
      if (!isUnreadableLogged) {
        isUnreadableLogged = true;
        log(
          `Suivi d'OBS : identifiants illisibles, les noms des réglages sont utilisés (${toReason(error)}).`,
        );
      }
      return undefined;
    }
  };

  const toWanted = (keys: readonly ObsNameKey[]): Wanted[] =>
    keys.flatMap((key) => {
      const name = configured.get(key);
      return name === undefined ? [] : [{ key, name }];
    });

  const resolveKeys = async (keys: readonly ObsNameKey[]): Promise<void> => {
    const wanted = toWanted(keys);
    const listed = await getListed(wanted);
    if (listed === undefined) return;
    // Un réglage changé pendant que OBS répondait a sa propre lecture : celle-ci ne lui rendrait que son ancien nom.
    const current = wanted.filter(({ key, name }) => configured.get(key) === name);
    for (const { key, name } of current)
      apply(key, toResolution(name, records.get(key), listed[toObsKind(key)]));
    persist();
  };

  // Le réglage prend un autre nom. Rend `true` quand la source du nouveau nom est encore à chercher dans OBS.
  const updateConfigured = (key: ObsNameKey, name: string | undefined): boolean => {
    if (name === undefined) {
      configured.delete(key);
      records.delete(key);
      emit(key, undefined);
      return false;
    }
    configured.set(key, name);
    const aligned = toAlignedRecord(records.get(key), name);
    keep(key, aligned);
    emit(key, name);
    return aligned === undefined;
  };

  const followRename = (key: ObsNameKey, renamed: ObsRenamed) => {
    const next = toRenamedRecord(key, records.get(key), configured.get(key), renamed);
    if (!next) return;
    records.set(key, next);
    log(toObsLine(key, { kind: "renamed", from: renamed.from }, next.name));
    emit(key, next.name);
  };

  source.onRenamed((renamed) => {
    for (const key of OBS_NAME_KEYS) followRename(key, renamed);
    persist();
  });

  return {
    getNames() {
      const result: ObsNames = {};
      for (const [key, name] of names) result[key] = name;
      return result;
    },
    update(next) {
      const toSearch: ObsNameKey[] = [];
      for (const key of OBS_NAME_KEYS) {
        const name = toConfiguredName(next[key]);
        if (name !== configured.get(key) && updateConfigured(key, name)) toSearch.push(key);
      }
      persist();
      if (toSearch.length > 0) void resolveKeys(toSearch);
    },
    resolve: () => resolveKeys(OBS_NAME_KEYS),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
