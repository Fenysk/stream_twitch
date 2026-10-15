import { ExpressionListSchema, type ExpressionSummary } from "../../src/domain/expression.schema";
import {
  type SettingsChanges,
  type SettingsIssue,
  SettingsRefusalSchema,
  type SettingsView,
  SettingsViewSchema,
} from "../../src/domain/settings.schema";
import { type FetchFn, type JsonRead, readJson, requestServer } from "./server-request";

export const REFRESH_PERIOD_MS = 10_000;

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

// La lecture des réglages du serveur, partagée par toutes les touches visibles : un minuteur, une lecture à la fois, et la
// réponse d'un PUT réussi qui met tout le monde à jour sans relecture de plus.
export class SettingsFeed {
  readonly #baseUrl: string;
  readonly #fetchFn: FetchFn;
  readonly #periodMs: number;
  readonly #visible = new Map<string, boolean>();
  readonly #listeners = new Set<Listener>();
  #snapshot: FeedSnapshot = { status: "pending" };
  #timer: ReturnType<typeof setInterval> | undefined;
  #reading: Reading | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(baseUrl: string, fetchFn: FetchFn = fetch, periodMs = REFRESH_PERIOD_MS) {
    this.#baseUrl = baseUrl;
    this.#fetchFn = fetchFn;
    this.#periodMs = periodMs;
  }

  get snapshot(): FeedSnapshot {
    return this.#snapshot;
  }

  onUpdate(listener: Listener): void {
    this.#listeners.add(listener);
  }

  // Une touche devient visible : le minuteur tourne tant qu'il en reste une. `wantsExpressions` : elle écrit le nom d'une expression.
  show(id: string, wantsExpressions: boolean): void {
    this.#visible.set(id, wantsExpressions);
    this.#timer ??= setInterval(() => void this.#tick(), this.#periodMs);
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
      const view = SettingsViewSchema.safeParse(reply.body);
      if (view.success) {
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
    try {
      const [settings, expressions] = await Promise.all([
        readJson(`${this.#baseUrl}/api/settings`, this.#fetchFn),
        withExpressions ? this.#readExpressions() : this.#expressions(),
      ]);
      this.#publish(this.#toSnapshot(settings, expressions));
    } finally {
      this.#reading = undefined;
    }
  }

  #toSnapshot(settings: JsonRead, expressions: readonly ExpressionSummary[]): FeedSnapshot {
    if (settings.kind !== "json") return { status: settings.kind };
    const view = SettingsViewSchema.safeParse(settings.body);
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
}
