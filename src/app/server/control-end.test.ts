import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toInstant, toInstantText } from "../../domain/instant.rules";
import type { LocalSettings } from "../../domain/settings.schema";
import { getSettings } from "../../infra/settings.repository";
import { type Control, createControl, OBS_OFFLINE } from "../../usecase/control.usecase";
import { createSettingsStore } from "../../usecase/settings.usecase";
import { toEndPort } from "./control-end";

const START = Date.parse("2026-10-19T20:00:00.000Z");
// Les vrais réglages par défaut (settings.json) : `foxEndAt` fait partie des réglages du renard, qui vont tous ensemble.
const DEFAULTS = getSettings(join(import.meta.dirname, "..", "..", "..", "settings.json"));

// Les réglages câblés comme runtime.ts le fait : le disque est un faux (`writes` garde ce qu'il reçoit, `isFull` le fait échouer),
// et chaque réglage changé va à la régie (`control.update`), qui est celle de la fin prévue.
const setup = () => {
  const disk = { writes: [] as LocalSettings[], isFull: false };
  const logs: string[] = [];
  let control: Control | undefined;
  const store = createSettingsStore({
    defaults: DEFAULTS,
    local: {},
    port: {
      updateLocal(local) {
        if (disk.isFull) throw new Error("disque plein");
        disk.writes.push(local);
      },
      deleteLocal: () => undefined,
    },
    onChange: (effective) => control?.update(effective),
    log: (line) => logs.push(line),
  });
  const noop = () => () => undefined;
  control = createControl({
    obs: {
      subscribe: noop,
      getState: async () => OBS_OFFLINE,
      updateProgramScene: async () => ({ ok: true }),
      updateInputMute: async () => ({ ok: true }),
      stopStream: async () => ({ ok: true }),
      updatePicture: async () => ({ ok: true }),
    },
    broadcast: { subscribe: noop },
    viewers: { getState: () => ({ kind: "unknown" }), subscribe: noop },
    phones: { getState: () => [], subscribe: noop },
    chat: { send: async () => ({ ok: true }) },
    chatViewers: { list: async () => ({ ok: true, chatViewers: [] }) },
    end: toEndPort(store),
    settings: DEFAULTS,
    listen: () => undefined,
    clock: () => START,
    schedule: () => () => undefined,
    log: (line) => logs.push(line),
  });
  return { store, control, disk, logs };
};

describe("toEndPort : la fin prévue du live par la régie", () => {
  it("écrit la fin dans les réglages, en texte ISO, et le disque la garde", () => {
    const { store, disk } = setup();
    const endAt = START + 30 * 60_000;
    expect(toEndPort(store).update(endAt)).toEqual({ ok: true });
    expect(store.getState().effective.foxEndAt).toBe(toInstantText(endAt));
    expect(disk.writes).toEqual([{ foxEndAt: toInstantText(endAt) }]);
  });

  it("retire la fin quand on lui donne `null`, comme le Stream Deck : le réglage est vide", () => {
    const { store } = setup();
    toEndPort(store).update(START + 600_000);
    expect(toEndPort(store).update(null)).toEqual({ ok: true });
    expect(store.getState().effective.foxEndAt).toBe("");
  });

  it("Si le disque refuse, alors le système doit rendre le refus des réglages en une phrase, sans changer la fin", () => {
    const { store, disk } = setup();
    disk.isFull = true;
    expect(toEndPort(store).update(START + 600_000)).toEqual({
      ok: false,
      message: "valeurs non enregistrées : disque plein",
    });
    expect(store.getState().effective.foxEndAt).toBe(DEFAULTS.foxEndAt);
  });
});

describe("la régie et les réglages, de bout en bout", () => {
  it("Quand la régie décale la fin, le système doit l'écrire dans les réglages et la redire à la régie", () => {
    const { control, store } = setup();
    const states: (number | null)[] = [];
    control.subscribe((state) => states.push(state.endAt));
    expect(control.updateEnd("later")).toEqual({ ok: true });
    const first = START + 10 * 60_000;
    expect(toInstant(store.getState().effective.foxEndAt ?? "")).toBe(first);
    expect(control.getState().endAt).toBe(first);
    expect(control.updateEnd("later")).toEqual({ ok: true });
    expect(states).toEqual([first, first + 10 * 60_000]);
  });

  it("revient à « aucune fin » quand « sooner » la ramène à maintenant", () => {
    const { control, store } = setup();
    control.updateEnd("later");
    control.updateEnd("sooner");
    expect(store.getState().effective.foxEndAt).toBe("");
    expect(control.getState().endAt).toBeNull();
  });

  it("Si le disque refuse, alors le geste de la régie doit être refusé (422) avec la raison", () => {
    const { control, disk } = setup();
    disk.isFull = true;
    expect(control.updateEnd("later")).toEqual({
      ok: false,
      status: 422,
      message: "valeurs non enregistrées : disque plein",
    });
  });
});
