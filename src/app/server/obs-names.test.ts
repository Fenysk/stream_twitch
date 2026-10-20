import { describe, expect, it } from "vitest";
import type { ObsIdentity, ObsRenamed } from "../../domain/obs-ids.rules";
import { toNamedSettings } from "../../domain/obs-ids.rules";
import type { ObsIdsFile } from "../../domain/obs-ids.schema";
import type { LocalSettings, Settings } from "../../domain/settings.schema";
import { createCameraBoost } from "../../usecase/camera-boost.usecase";
import { createControl, OBS_OFFLINE } from "../../usecase/control.usecase";
import { createObsIds, type ObsIdsSource } from "../../usecase/obs-ids.usecase";
import { createSettingsStore } from "../../usecase/settings.usecase";
import type { ShowDirector } from "../../usecase/show-director.usecase";
import { followObsNames } from "./obs-names";

const DEFAULTS: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  cameraSlotScene: "Master - Webcam",
  showEndScene: "Fin",
  cameraBoostTarget: -17,
  threshold: -40,
  delay: 250,
};

// Ce que la session d'avant a retenu : le mic, la place caméra et la scène de fin.
const REMEMBERED: ObsIdsFile = {
  ids: {
    micName: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Mic/Aux" },
    cameraSlotScene: { configuredName: "Master - Webcam", uuid: "s-webcam", name: "Master - Webcam" },
    showEndScene: { configuredName: "Fin", uuid: "s-end", name: "Fin" },
  },
};

const noop = () => undefined;

// Le serveur câblé comme runtime.ts le fait pour les noms d'OBS : le suivi des identifiants sur un faux OBS, les vrais réglages, la
// vraie régie et le vrai boost ; l'émission est un espion. Le test lit ce qu'ils reçoivent.
const setup = (options: { failsToWrite?: boolean } = {}) => {
  const logs: string[] = [];
  const listeners: Array<(renamed: ObsRenamed) => void> = [];
  const source: ObsIdsSource = {
    listInputIdentities: async (): Promise<ObsIdentity[]> => [],
    listSceneIdentities: async (): Promise<ObsIdentity[]> => [],
    onRenamed: (listener) => listeners.push(listener),
  };
  const sendRenamed = (renamed: ObsRenamed) => {
    for (const listener of listeners) listener(renamed);
  };
  const disk = { file: REMEMBERED as ObsIdsFile | undefined };
  const ids = createObsIds({
    source,
    store: {
      get: () => disk.file,
      update(file) {
        disk.file = file;
      },
    },
    settings: DEFAULTS,
    log: (line) => logs.push(line),
  });
  const named = (effective: Settings): Settings => toNamedSettings(effective, ids.getNames());

  const asked: string[] = [];
  const listened: string[] = [];
  const control = createControl({
    obs: {
      subscribe: () => noop,
      async getState(pcMic) {
        asked.push(pcMic);
        return { ...OBS_OFFLINE, isLinked: true, isPcMuted: false };
      },
      updateProgramScene: async () => ({ ok: true }),
      updateInputMute: async () => ({ ok: true }),
      stopStream: async () => ({ ok: true }),
      updatePicture: async () => ({ ok: true }),
    },
    broadcast: { subscribe: () => noop },
    viewers: { getState: () => ({ kind: "unknown" }), subscribe: () => noop },
    phones: { getState: () => [], subscribe: () => noop },
    chat: { send: async () => ({ ok: true }) },
    chatViewers: { list: async () => ({ ok: true, chatViewers: [] }) },
    end: { update: () => ({ ok: true }) },
    settings: named(DEFAULTS),
    listen: (input) => listened.push(input),
    clock: () => 0,
    schedule: () => noop,
    log: (line) => logs.push(line),
  });
  const boosted: string[] = [];
  const boost = createCameraBoost({
    levels: { subscribe: () => noop },
    port: {
      async createFilters(input) {
        boosted.push(input);
        return { ok: false, reason: "essai" };
      },
      updateBoost: async () => ({ ok: true }),
    },
    settings: named(DEFAULTS),
    schedule: () => noop,
    log: (line) => logs.push(line),
  });
  const endScenes: string[] = [];
  const director: Pick<ShowDirector, "update"> = {
    update: (settings) => endScenes.push(settings.showEndScene ?? ""),
  };

  const written: LocalSettings[] = [];
  const settings = createSettingsStore({
    defaults: DEFAULTS,
    local: {},
    port: {
      updateLocal(local) {
        if (options.failsToWrite) throw new Error("EACCES");
        written.push(local);
      },
      deleteLocal: noop,
    },
    // Comme runtime.ts : le suivi lit les noms des réglages, puis ceux qui les lisent reçoivent les noms d'OBS.
    onChange: (effective) => {
      ids.update(effective);
      const current = named(effective);
      control.update(current);
      boost.update(current);
      director.update(current);
    },
    log: (line) => logs.push(line),
  });
  followObsNames({ ids, settings, boost, control, director, log: (line) => logs.push(line) });
  control.start();
  boost.start();
  // Les lectures d'OBS de la régie, et la lecture des scènes du suivi, finissent après l'évènement qui les lance.
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    ids,
    settings,
    boost,
    asked,
    listened,
    boosted,
    endScenes,
    written,
    logs,
    disk,
    sendRenamed,
    settle,
  };
};

describe("followObsNames : le mic du PC renommé dans OBS", () => {
  it("fait lire le mic du PC sous son nouveau nom à la régie, et la tête et Jean-Renard l'écoutent sous ce nom", async () => {
    const { sendRenamed, settle, asked, listened } = setup();
    await settle();
    expect(asked.at(-1)).toBe("Mic/Aux");
    sendRenamed({ kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" });
    await settle();
    expect(asked.at(-1)).toBe("Micro PC");
    expect(listened.at(-1)).toBe("Micro PC");
  });

  it("empêche le boost de prendre le mic du PC renommé pour une caméra", async () => {
    const { sendRenamed, settle, boost, boosted } = setup();
    sendRenamed({ kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" });
    await settle();
    boost.updateLiveInput("Micro PC");
    expect(boosted).toEqual([]);
    boost.updateLiveInput("Caméra 1 OBS");
    expect(boosted).toEqual(["Caméra 1 OBS"]);
  });

  it("ne pousse rien à personne quand c'est une source qu'aucun réglage ne désigne qui est renommée", async () => {
    const { sendRenamed, settle, asked, endScenes } = setup();
    await settle();
    const before = { asks: asked.length, scenes: endScenes.length };
    sendRenamed({ kind: "input", uuid: "u-autre", from: "Caméra", to: "Webcam USB" });
    await settle();
    expect({ asks: asked.length, scenes: endScenes.length }).toEqual(before);
  });
});

describe("followObsNames : la scène de fin renommée dans OBS", () => {
  const renamed: ObsRenamed = { kind: "scene", uuid: "s-end", from: "Fin", to: "Au revoir" };

  it("passe l'émission sur le nouveau nom, et le réglage que l'onglet Émission montre le suit", async () => {
    const { sendRenamed, settle, settings, endScenes, written } = setup();
    sendRenamed(renamed);
    await settle();
    expect(endScenes.at(-1)).toBe("Au revoir");
    expect(settings.getState().effective.showEndScene).toBe("Au revoir");
    expect(written).toEqual([{ showEndScene: "Au revoir" }]);
  });

  it("garde la scène suivie : une seconde renommée est suivie aussi, sans boucle d'écriture", async () => {
    const { sendRenamed, settle, settings, written, disk } = setup();
    sendRenamed(renamed);
    await settle();
    sendRenamed({ ...renamed, from: "Au revoir", to: "Générique" });
    await settle();
    expect(settings.getState().effective.showEndScene).toBe("Générique");
    expect(written).toHaveLength(2);
    expect(disk.file?.ids.showEndScene).toEqual({
      configuredName: "Générique",
      uuid: "s-end",
      name: "Générique",
    });
  });

  it("dit que le réglage n'est pas enregistré quand le disque refuse, et l'émission suit quand même", async () => {
    const { sendRenamed, settle, endScenes, logs } = setup({ failsToWrite: true });
    sendRenamed(renamed);
    await settle();
    expect(logs).toContain(
      "Réglages : la scène de fin « Au revoir » n'est pas enregistrée (valeurs non enregistrées : EACCES).",
    );
    expect(endScenes.at(-1)).toBe("Au revoir");
  });
});

describe("followObsNames : la place caméra renommée dans OBS", () => {
  it("ne touche pas aux réglages : seul le client OBS la lit, et il l'a déjà", async () => {
    const { sendRenamed, settle, settings, ids, written } = setup();
    sendRenamed({ kind: "scene", uuid: "s-webcam", from: "Master - Webcam", to: "Place caméra" });
    await settle();
    expect(ids.getNames().cameraSlotScene).toBe("Place caméra");
    expect(settings.getState().effective.cameraSlotScene).toBe("Master - Webcam");
    expect(written).toEqual([]);
  });
});
