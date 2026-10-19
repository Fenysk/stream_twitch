import { describe, expect, it } from "vitest";
import type { LocalSettings, Settings } from "../domain/settings.schema";
import { createSettingsStore, type SettingsPort } from "./settings.usecase";

const defaults: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  quietLevel: -25,
  loudLevel: -10,
  quietScale: 0.5,
  loudScale: 1.5,
};

// Un faux disque : il garde ce qu'on lui écrit, et peut tomber en panne.
// Les défauts sans quietLevel : le threshold devient le niveau doux, et peut alors dépasser le loudLevel.
const { quietLevel: _quietLevel, ...withoutQuietLevel } = defaults;

const setup = (local: LocalSettings = {}, options: { isDiskBroken?: boolean; defaults?: Settings } = {}) => {
  const written: LocalSettings[] = [];
  const state = { deletions: 0 };
  const changes: Settings[] = [];
  const messages: string[] = [];
  const port: SettingsPort = {
    updateLocal(next) {
      if (options.isDiskBroken) throw new Error("disque plein");
      written.push(next);
    },
    deleteLocal() {
      if (options.isDiskBroken) throw new Error("disque plein");
      state.deletions += 1;
    },
  };
  const store = createSettingsStore({
    defaults: options.defaults ?? defaults,
    local,
    port,
    onChange: (effective) => changes.push(effective),
    log: (message) => messages.push(message),
  });
  return { store, written, state, changes, messages };
};

describe("createSettingsStore : au démarrage", () => {
  it("met les valeurs locales devant les valeurs par défaut, sans rien écrire ni signaler", () => {
    const { store, written, changes } = setup({ threshold: -35 });
    expect(store.getState()).toEqual({
      defaults,
      local: { threshold: -35 },
      effective: { ...defaults, threshold: -35 },
    });
    expect(written).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("ignore des valeurs locales qui ne vont plus avec les valeurs par défaut, le dit, et garde le fichier", () => {
    const { store, state, messages } = setup({ threshold: -5 }, { defaults: withoutQuietLevel });
    expect(store.getState()).toEqual({
      defaults: withoutQuietLevel,
      local: {},
      effective: withoutQuietLevel,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("settings.local.json ignoré");
    expect(messages[0]).toContain("loudLevel");
    expect(state.deletions).toBe(0);
  });
});

describe("createSettingsStore : update", () => {
  it("applique la liste des comptes ignorés sans redémarrer : elle s'écrit et part dans le changement que le tchat et le renard reçoivent", () => {
    const { store, written, changes } = setup();
    const result = store.update({ chatBots: ["nightbot", "WZBot"] });
    expect(result.ok).toBe(true);
    expect(written).toEqual([{ chatBots: ["nightbot", "WZBot"] }]);
    expect(changes).toEqual([{ ...defaults, chatBots: ["nightbot", "WZBot"] }]);
  });

  it("applique un changement valide : il s'écrit, s'applique et se lit", () => {
    const { store, written, changes } = setup();
    const result = store.update({ threshold: -35 });
    expect(result.ok).toBe(true);
    expect(written).toEqual([{ threshold: -35 }]);
    expect(changes).toEqual([{ ...defaults, threshold: -35 }]);
    expect(store.getState().effective.threshold).toBe(-35);
    expect(store.getState().local).toEqual({ threshold: -35 });
  });

  it("cumule les changements successifs dans les valeurs locales", () => {
    const { store, written } = setup();
    store.update({ threshold: -35 });
    store.update({ tilt: 0.5 });
    expect(written.at(-1)).toEqual({ threshold: -35, tilt: 0.5 });
  });

  it("refuse un changement invalide en nommant le réglage, sans rien écrire ni appliquer", () => {
    const { store, written, changes } = setup();
    const result = store.update({ loudLevel: -30 });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map(({ path }) => path)).toEqual(["loudLevel"]);
    expect(written).toEqual([]);
    expect(changes).toEqual([]);
    expect(store.getState().effective).toEqual(defaults);
  });

  it("garde l'état d'avant après un refus, et accepte le changement suivant", () => {
    const { store } = setup({ threshold: -35 });
    store.update({ tilt: -1 });
    expect(store.getState().local).toEqual({ threshold: -35 });
    expect(store.update({ tilt: 0.5 }).ok).toBe(true);
  });

  it("refuse un réglage inconnu et l'adresse d'OBS", () => {
    const { store, written } = setup();
    const result = store.update({ obsAddress: "ws://autre:4455" });
    expect(result.ok).toBe(false);
    expect(written).toEqual([]);
  });

  it("retire un réglage local avec null : le réglage reprend sa valeur par défaut", () => {
    const { store, written } = setup({ threshold: -35, opening: 2 });
    store.update({ threshold: null });
    expect(written).toEqual([{ opening: 2 }]);
    expect(store.getState().effective.threshold).toBe(-40);
  });

  it("supprime le fichier local quand le dernier réglage local est retiré", () => {
    const { store, written, state } = setup({ threshold: -35 });
    store.update({ threshold: null });
    expect(state.deletions).toBe(1);
    expect(written).toEqual([]);
    expect(store.getState().local).toEqual({});
  });

  it("n'applique rien et le dit quand le disque refuse d'écrire", () => {
    const { store, changes } = setup({}, { isDiskBroken: true });
    const result = store.update({ threshold: -35 });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues[0]?.message).toContain("disque plein");
    expect(changes).toEqual([]);
    expect(store.getState().local).toEqual({});
  });
});

describe("createSettingsStore : reset", () => {
  it("supprime les valeurs locales et applique les valeurs par défaut", () => {
    const { store, state, changes } = setup({ threshold: -35 });
    const result = store.reset();
    expect(result.ok).toBe(true);
    expect(state.deletions).toBe(1);
    expect(changes).toEqual([defaults]);
    expect(store.getState()).toEqual({ defaults, local: {}, effective: defaults });
  });

  it("garde l'état quand le disque refuse de supprimer", () => {
    const { store, changes } = setup({ threshold: -35 }, { isDiskBroken: true });
    const result = store.reset();
    expect(result.ok).toBe(false);
    expect(changes).toEqual([]);
    expect(store.getState().local).toEqual({ threshold: -35 });
  });
});

describe("createSettingsStore : abonnés", () => {
  it("dit chaque nouvel état à ceux qui écoutent, sans rien dire au départ", () => {
    const { store } = setup();
    const heard: number[] = [];
    store.subscribe(({ effective }) => heard.push(effective.threshold));
    expect(heard).toEqual([]);
    store.update({ threshold: -35 });
    store.update({ threshold: -30 });
    expect(heard).toEqual([-35, -30]);
  });

  it("donne l'état complet : les valeurs par défaut, les valeurs locales et celles qui s'appliquent", () => {
    const { store } = setup();
    const states: unknown[] = [];
    store.subscribe((state) => states.push(state));
    store.update({ threshold: -35 });
    expect(states).toEqual([
      { defaults, local: { threshold: -35 }, effective: { ...defaults, threshold: -35 } },
    ]);
  });

  it("dit aussi le retour aux valeurs par défaut", () => {
    const { store } = setup({ threshold: -35 });
    const heard: number[] = [];
    store.subscribe(({ effective }) => heard.push(effective.threshold));
    store.reset();
    expect(heard).toEqual([-40]);
  });

  it("ne dit rien quand le changement est refusé, par une valeur invalide ou par le disque", () => {
    const valid = setup();
    const heardValid: unknown[] = [];
    valid.store.subscribe((state) => heardValid.push(state));
    valid.store.update({ threshold: 99 });
    expect(heardValid).toEqual([]);
    const broken = setup({}, { isDiskBroken: true });
    const heardBroken: unknown[] = [];
    broken.store.subscribe((state) => heardBroken.push(state));
    broken.store.update({ threshold: -35 });
    broken.store.reset();
    expect(heardBroken).toEqual([]);
  });

  it("ne dit plus rien à celui qui s'est désabonné, et sert chaque abonné", () => {
    const { store } = setup();
    const first: number[] = [];
    const second: number[] = [];
    const stop = store.subscribe(({ effective }) => first.push(effective.threshold));
    store.subscribe(({ effective }) => second.push(effective.threshold));
    store.update({ threshold: -35 });
    stop();
    store.update({ threshold: -30 });
    expect(first).toEqual([-35]);
    expect(second).toEqual([-35, -30]);
  });

  it("finit sur le dernier état quand `onChange` change lui-même un réglage : les abonnés les voient dans l'ordre", () => {
    const heard: number[] = [];
    const store = createSettingsStore({
      defaults,
      local: {},
      port: { updateLocal: () => undefined, deleteLocal: () => undefined },
      onChange: ({ threshold }) => {
        if (threshold === -35) store.update({ threshold: -30 });
      },
      log: () => undefined,
    });
    store.subscribe(({ effective }) => heard.push(effective.threshold));
    store.update({ threshold: -35 });
    expect(heard).toEqual([-35, -30]);
    expect(store.getState().effective.threshold).toBe(-30);
  });
});
