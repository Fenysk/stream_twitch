import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toSettingsView } from "../../domain/settings.rules";
import type { Settings, SettingsView } from "../../domain/settings.schema";
import { getSettings } from "../../infra/settings.repository";
import { createSettingsStore, type SettingsState } from "../../usecase/settings.usecase";
import { openSettingsStream, SETTINGS_KEEPALIVE_EVENT, SETTINGS_KEEPALIVE_MS } from "./settings-stream";

// Les vrais réglages par défaut (settings.json) et le vrai usecase : un changement vient par `update`, d'où qu'il soit demandé.
const DEFAULTS: Settings = getSettings(join(import.meta.dirname, "..", "..", "..", "settings.json"));

const setup = () => {
  const store = createSettingsStore({
    defaults: DEFAULTS,
    local: {},
    port: { updateLocal: () => undefined, deleteLocal: () => undefined },
    onChange: () => undefined,
    log: () => undefined,
  });
  const views: SettingsView[] = [];
  const beats: unknown[] = [];
  const close = openSettingsStream(
    { settings: store },
    (view) => views.push(view),
    (event, payload) => beats.push([event, payload]),
  );
  return { store, views, beats, close };
};

describe("openSettingsStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Quand une connexion s'ouvre, le système doit lui envoyer tout de suite la vue des réglages, celle de GET /api/settings", () => {
    const { store, views } = setup();
    expect(views).toEqual([toSettingsView(store.getState())]);
  });

  it("envoie la vue à chaque changement, d'où qu'il vienne : réglage changé, puis retour aux valeurs par défaut", () => {
    const { store, views } = setup();
    store.update({ foxEndAt: "2026-10-19T21:30:00.000Z" });
    store.reset();
    expect(views).toHaveLength(3);
    expect(views[1]?.local).toEqual({ foxEndAt: "2026-10-19T21:30:00.000Z" });
    expect(views[1]?.effective.foxEndAt).toBe("2026-10-19T21:30:00.000Z");
    expect(views[2]?.local).toEqual({});
  });

  it("n'envoie rien quand un changement est refusé", () => {
    const { store, views } = setup();
    store.update({ threshold: 99 });
    expect(views).toHaveLength(1);
  });

  it("envoie un message keepalive sans rien dedans toutes les 30 s, sous un nom : le plugin ne lit que les messages sans nom", async () => {
    const { beats } = setup();
    await vi.advanceTimersByTimeAsync(SETTINGS_KEEPALIVE_MS - 1);
    expect(beats).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(SETTINGS_KEEPALIVE_MS);
    expect(beats).toEqual([
      [SETTINGS_KEEPALIVE_EVENT, null],
      [SETTINGS_KEEPALIVE_EVENT, null],
    ]);
  });

  it("Quand la connexion se ferme, le système doit ne plus rien envoyer : ni changement ni keepalive", async () => {
    const { store, views, beats, close } = setup();
    close();
    store.update({ foxEndAt: "2026-10-19T21:30:00.000Z" });
    await vi.advanceTimersByTimeAsync(SETTINGS_KEEPALIVE_MS * 3);
    expect(views).toHaveLength(1);
    expect(beats).toEqual([]);
  });

  it("sert chaque connexion pour elle seule : en fermer une laisse l'autre écouter", () => {
    const store = createSettingsStore({
      defaults: DEFAULTS,
      local: {},
      port: { updateLocal: () => undefined, deleteLocal: () => undefined },
      onChange: () => undefined,
      log: () => undefined,
    });
    const first: SettingsView[] = [];
    const second: SettingsView[] = [];
    const closeFirst = openSettingsStream(
      { settings: store },
      (view) => first.push(view),
      () => undefined,
    );
    openSettingsStream(
      { settings: store },
      (view) => second.push(view),
      () => undefined,
    );
    closeFirst();
    const state: SettingsState = store.getState();
    store.update({ foxEndAt: "2026-10-19T21:30:00.000Z" });
    expect(first).toEqual([toSettingsView(state)]);
    expect(second).toHaveLength(2);
  });
});
