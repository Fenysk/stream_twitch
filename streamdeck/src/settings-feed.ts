import { ExpressionListSchema, type ExpressionSummary } from "../../src/domain/expression.schema";
import {
  type SettingsChanges,
  type SettingsIssue,
  SettingsRefusalSchema,
  type SettingsView,
  SettingsViewSchema,
} from "../../src/domain/settings.schema";
import { type FetchFn, type JsonRead, readJson, requestServer } from "./server-request";
import { RECONNECT_MS, SseFollower } from "./sse-follower";

// La relecture de secours : le flux des réglages dit les changements tout de suite, elle couvre un flux coupé, un serveur arrêté et les
// expressions (le flux ne les porte pas).
export const REFRESH_PERIOD_MS = 10_000;
// Un flux coupé se rouvre après ce délai, tant qu'une touche est visible (voir sse-follower.ts).
export { RECONNECT_MS };

const SETTINGS_EVENTS_PATH = "/api/settings/events";

// Un serveur plus récent que le plugin : le réglage inconnu est écarté, pas refusé (le schéma strict reste celui du serveur).
const { defaults, local, effective } = SettingsViewSchema.shape;
const PluginSettingsViewSchema = SettingsViewSchema.extend({
  defaults: defaults.strip(),
  local: local.strip(),
  effective: effective.strip(),
});

// Ce que le plugin sait du serveur : rien encore, injoignable, réponse illisible, ou les réglages (et les expressions, si une touche en a besoin).
export type FeedSnapshot =
  | { status: "pending" }
  | { status: "down" }
  | { status: "to-restart" }
  | { status: "ready"; view: SettingsView; expressions: readonly ExpressionSummary[] };

export type ChangeResult =
  | { ok: true }
  | { ok: false; reason: "refused"; issues: SettingsIssue[] }
  | { ok: false; reason: "unavailable" };

type Reading = { hasExpressions: boolean; done: Promise<void> };

type Listener = (snapshot: FeedSnapshot) => void;

// `periodMs` : la relecture de secours. `hasStream` : lire aussi le flux des réglages du serveur (`GET /api/settings/events`), pour voir
// un changement tout de suite, d'où qu'il vienne ; sans lui, seule la relecture périodique. `log` : les coupures du flux.
export type FeedOptions = {
  periodMs?: number;
  hasStream?: boolean;
  log?: (message: string) => void;
};

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// La lecture des réglages du serveur, partagée par toutes les touches visibles : un flux qui dit chaque changement tout de suite (s'il
// est demandé), un minuteur de secours, une lecture à la fois, et la réponse d'un PUT réussi qui met tout le monde à jour sans relecture
// de plus.
export class SettingsFeed {
  readonly #baseUrl: string;
  readonly #fetchFn: FetchFn;
  readonly #periodMs: number;
  readonly #hasStream: boolean;
  readonly #log: (message: string) => void;
  readonly #visible = new Map<string, boolean>();
  readonly #listeners = new Set<Listener>();
  #snapshot: FeedSnapshot = { status: "pending" };
  #timer: ReturnType<typeof setInterval> | undefined;
  #reading: Reading | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  // Le flux des réglages du serveur : un seul pour toutes les touches, rouvert tout seul tant qu'une touche est visible.
  readonly #follower: SseFollower;
  // Le nombre de vues que le flux ou un PUT ont données : une lecture partie avant la dernière est périmée et ne la remplace pas.
  #news = 0;

  constructor(baseUrl: string, fetchFn: FetchFn = fetch, options: FeedOptions = {}) {
    this.#baseUrl = baseUrl;
    this.#fetchFn = fetchFn;
    this.#periodMs = options.periodMs ?? REFRESH_PERIOD_MS;
    this.#hasStream = options.hasStream ?? false;
    this.#log = options.log ?? (() => undefined);
    this.#follower = new SseFollower({
      url: `${baseUrl}${SETTINGS_EVENTS_PATH}`,
      fetchFn,
      label: "Flux des réglages",
      onMessage: (data) => this.#onStreamMessage(data),
      // Le serveur est-il arrêté, ou revenu ? Les réglages se relisent tout de suite.
      onEnd: ({ wasStreaming }) => {
        if (wasStreaming) void this.refresh();
      },
      isWanted: () => this.#visible.size > 0,
      log: this.#log,
    });
  }

  get snapshot(): FeedSnapshot {
    return this.#snapshot;
  }

  onUpdate(listener: Listener): void {
    this.#listeners.add(listener);
  }

  // Une touche devient visible : le flux et le minuteur tournent tant qu'il en reste une. `wantsExpressions` : elle écrit le nom d'une
  // expression.
  show(id: string, wantsExpressions: boolean): void {
    this.#visible.set(id, wantsExpressions);
    this.#timer ??= setInterval(() => void this.#tick(), this.#periodMs);
    this.#listen();
    void this.refresh();
  }

  // Le réglage de la touche a changé : elle veut ou ne veut plus les expressions, sans relire tout de suite.
  want(id: string, wantsExpressions: boolean): void {
    if (this.#visible.has(id)) this.#visible.set(id, wantsExpressions);
  }

  hide(id: string): void {
    this.#visible.delete(id);
    if (this.#visible.size > 0) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#follower.stop();
  }

  // Les appuis passent l'un après l'autre : deux appuis rapprochés lisent chacun le résultat du premier.
  run<Result>(task: () => Promise<Result>): Promise<Result> {
    const next = this.#queue.then(task);
    // La file ne garde que l'ordre : l'échec de la tâche va à celui qui l'attend, pas à la suivante.
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  // Une lecture en cours sert tout le monde ; une lecture sans expressions ne sert pas qui en veut.
  async refresh(options?: { withExpressions?: boolean }): Promise<FeedSnapshot> {
    const withExpressions = options?.withExpressions ?? this.#wantsExpressions();
    while (this.#reading) {
      const { hasExpressions, done } = this.#reading;
      await done;
      if (hasExpressions || !withExpressions) return this.#snapshot;
    }
    const done = this.#read(withExpressions);
    this.#reading = { hasExpressions: withExpressions, done };
    await done;
    return this.#snapshot;
  }

  async change(changes: SettingsChanges): Promise<ChangeResult> {
    const reply = await requestServer(`${this.#baseUrl}/api/settings`, this.#fetchFn, {
      method: "PUT",
      body: { changes },
    });
    if (reply.kind === "down") {
      this.#publish({ status: "down" });
      return { ok: false, reason: "unavailable" };
    }
    if (reply.isOk) {
      const view = PluginSettingsViewSchema.safeParse(reply.body);
      if (view.success) {
        this.#news += 1;
        this.#publish({ status: "ready", view: view.data, expressions: this.#expressions() });
        return { ok: true };
      }
    } else if (reply.status === 422) {
      const refusal = SettingsRefusalSchema.safeParse(reply.body);
      return { ok: false, reason: "refused", issues: refusal.success ? refusal.data.issues : [] };
    }
    this.#publish({ status: "to-restart" });
    return { ok: false, reason: "unavailable" };
  }

  #wantsExpressions(): boolean {
    return [...this.#visible.values()].some(Boolean);
  }

  #expressions(): readonly ExpressionSummary[] {
    return this.#snapshot.status === "ready" ? this.#snapshot.expressions : [];
  }

  async #tick(): Promise<void> {
    if (this.#reading) return;
    await this.refresh();
  }

  async #read(withExpressions: boolean): Promise<void> {
    const startedAt = this.#news;
    try {
      const [settings, expressions] = await Promise.all([
        readJson(`${this.#baseUrl}/api/settings`, this.#fetchFn),
        withExpressions ? this.#readExpressions() : this.#expressions(),
      ]);
      this.#publish(
        startedAt === this.#news
          ? this.#toSnapshot(settings, expressions)
          : this.#keepNews(settings, expressions),
      );
    } finally {
      this.#reading = undefined;
    }
  }

  // Le flux (ou un PUT) a donné une vue depuis le départ de cette lecture : la sienne est plus récente que ce que le serveur a répondu,
  // seules les expressions de la lecture s'y ajoutent.
  #keepNews(settings: JsonRead, expressions: readonly ExpressionSummary[]): FeedSnapshot {
    const current = this.#snapshot;
    return current.status === "ready" ? { ...current, expressions } : this.#toSnapshot(settings, expressions);
  }

  #toSnapshot(settings: JsonRead, expressions: readonly ExpressionSummary[]): FeedSnapshot {
    if (settings.kind !== "json") return { status: settings.kind };
    const view = PluginSettingsViewSchema.safeParse(settings.body);
    return view.success ? { status: "ready", view: view.data, expressions } : { status: "to-restart" };
  }

  // Les noms ne servent qu'à l'affichage : une liste illisible garde la précédente, sans faire tomber les réglages.
  async #readExpressions(): Promise<readonly ExpressionSummary[]> {
    const read = await readJson(`${this.#baseUrl}/api/expressions`, this.#fetchFn);
    if (read.kind !== "json") return this.#expressions();
    const list = ExpressionListSchema.safeParse(read.body);
    return list.success ? list.data.expressions : this.#expressions();
  }

  #publish(snapshot: FeedSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }

  // Le flux s'ouvre avec la première touche visible, un seul pour toutes.
  #listen(): void {
    if (this.#hasStream) this.#follower.start();
  }

  // Chaque message sans nom du flux est la vue des réglages, plus récente que toute lecture déjà partie ; les autres (`keepalive`) ne
  // disent rien.
  #onStreamMessage(data: string): void {
    this.#news += 1;
    this.#publish(this.#toStreamSnapshot(data));
  }

  // La vue du flux se lit comme celle de GET /api/settings : un réglage inconnu du plugin est écarté, une vue illisible dit que le serveur
  // n'est plus celui du plugin.
  #toStreamSnapshot(data: string): FeedSnapshot {
    try {
      const view = PluginSettingsViewSchema.safeParse(JSON.parse(data));
      if (view.success) return { status: "ready", view: view.data, expressions: this.#expressions() };
    } catch (error) {
      this.#log(`Flux des réglages : message illisible (${toReason(error)}).`);
    }
    return { status: "to-restart" };
  }
}
