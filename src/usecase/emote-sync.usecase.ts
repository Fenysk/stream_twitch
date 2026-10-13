import {
  EMOTE_PROVIDER_LABELS,
  EMOTE_PROVIDERS,
  EMOTE_SCOPES,
  type EmoteLists,
  type EmoteProvider,
  type EmoteScope,
  type StoredEmotes,
  toEmoteCount,
  toEmoteNames,
  toEmptyLists,
  toKnownEmoteNames,
} from "../domain/emote-sync.rules";

// Un service d'emotes vu du usecase : `missing` quand il n'a rien pour cette chaîne (un 404 : pas d'emotes de chaîne, ce n'est
// pas une erreur). Le reste (réseau, délai dépassé, autre code HTTP) lève.
export type EmoteAnswer = { kind: "found"; json: unknown } | { kind: "missing" };
export type EmotePort = { get(provider: EmoteProvider, scope: EmoteScope): Promise<EmoteAnswer> };

// Ce que le serveur garde entre deux démarrages (data/emotes.txt).
export type EmoteStorePort = { get(): StoredEmotes | undefined; update(stored: StoredEmotes): void };

export type EmoteSyncDeps = {
  port: EmotePort;
  store: EmoteStorePort;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type EmoteSync = {
  // Reprend les dernières listes gardées, synchronise tout de suite puis toutes les heures. Finit à la première synchro.
  start(): Promise<void>;
  stop(): void;
  // Les noms de 7TV, BTTV et FFZ synchronisés ; les ajouts à la main (`foxEmoteNames`) s'ajoutent au filtre à côté.
  getNames(): readonly string[];
};

export const EMOTE_SYNC_PERIOD_MS = 3_600_000;

type Answered = { provider: EmoteProvider; scope: EmoteScope; names: string[] | null; reason: string };

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const toScopeLabel = (scope: EmoteScope): string => (scope === "global" ? "globales" : "de la chaîne");

export function createEmoteSync({ port, store, clock, schedule, log }: EmoteSyncDeps): EmoteSync {
  let lists: EmoteLists = store.get()?.lists ?? toEmptyLists();
  let known: readonly string[] = toKnownEmoteNames(lists, []);
  let cancelNext: (() => void) | undefined;
  let isStopped = false;

  // Une liste à jour, ou `names: null` et sa raison : le service n'a pas répondu (ou pas comme il faut).
  const getList = async (provider: EmoteProvider, scope: EmoteScope): Promise<Answered> => {
    try {
      const answer = await port.get(provider, scope);
      if (answer.kind === "missing") return { provider, scope, names: [], reason: "" };
      const names = toEmoteNames(provider, scope, answer.json);
      return { provider, scope, names, reason: names === null ? "réponse illisible" : "" };
    } catch (error) {
      return { provider, scope, names: null, reason: toReason(error) };
    }
  };

  const toCountsLine = (current: EmoteLists): string =>
    `Emotes : ${EMOTE_PROVIDERS.map((provider) => `${EMOTE_PROVIDER_LABELS[provider]} ${toEmoteCount(current, provider)}`).join(", ")} (globales et de la chaîne).`;

  const sync = async (isFirst: boolean): Promise<void> => {
    const before = lists;
    const results = await Promise.all(
      EMOTE_PROVIDERS.flatMap((provider) => EMOTE_SCOPES.map((scope) => getList(provider, scope))),
    );
    const next = structuredClone(before);
    const failures: string[] = [];
    for (const { provider, scope, names, reason } of results) {
      if (names === null) {
        failures.push(`${EMOTE_PROVIDER_LABELS[provider]} ${toScopeLabel(scope)} : ${reason}`);
      } else {
        next[provider][scope] = names;
      }
    }
    if (failures.length > 0) {
      log(
        `Emotes : synchronisation incomplète (${failures.join(" ; ")}), les dernières listes reçues sont gardées.`,
      );
    }
    const isChanged = JSON.stringify(next) !== JSON.stringify(before);
    lists = next;
    known = toKnownEmoteNames(lists, []);
    if (isChanged || isFirst) {
      if (isChanged) store.update({ savedAt: clock(), lists });
      log(toCountsLine(lists));
    }
  };

  const loop = async (isFirst: boolean): Promise<void> => {
    try {
      await sync(isFirst);
    } catch (error) {
      log(`Emotes : synchronisation impossible, ${toReason(error)}`);
    }
    if (!isStopped) cancelNext = schedule(() => void loop(false), EMOTE_SYNC_PERIOD_MS);
  };

  return {
    start() {
      isStopped = false;
      return loop(true);
    },
    stop() {
      isStopped = true;
      cancelNext?.();
      cancelNext = undefined;
    },
    getNames: () => known,
  };
}
