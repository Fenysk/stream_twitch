import { describe, expect, it } from "vitest";
import { MUTE_MIC_ID } from "../domain/control.rules";
import type { ControlState } from "../domain/control.schema";
import { toInstantText } from "../domain/instant.rules";
import type { PhoneSummary } from "../domain/phone.schema";
import type { ViewersState } from "../domain/viewers.types";
import {
  type ChatViewersPort,
  type ChatWriterPort,
  type ControlSettings,
  createControl,
  OBS_OFFLINE,
  type ObsControlState,
} from "./control.usecase";
import type { Broadcast } from "./fox-hours.usecase";
import type { ShowSceneResult } from "./show-director.usecase";

const START = Date.parse("2026-10-19T20:00:00.000Z");

const LINKED: ObsControlState = {
  isLinked: true,
  scene: "Jeu",
  scenes: ["Jeu", "Pause"],
  isPcMuted: false,
  cameras: [
    { number: 1, input: "Camera 1 OBS", isMuted: true },
    { number: 2, input: "Camera 2 OBS", isMuted: true },
  ],
  onAir: [2],
  picture: [],
};

// La place caméra de l'OBS d'Alexis : le PC visible, la tête et deux caméras cachées, dans l'ordre d'OBS.
const PLACE: ObsControlState["picture"] = [
  { id: "pc", label: "PC", isVisible: true },
  { id: "head", label: "Tête", isVisible: false },
  { id: "camera-1", label: "Caméra 1", isVisible: false },
  { id: "camera-2", label: "Caméra 2", isVisible: false },
];
const WITH_PICTURE: ObsControlState = { ...LINKED, picture: PLACE };

// Tout ce que la régie touche, à la main : OBS (son état, ses demandes), la diffusion, les viewers, les téléphones, le chat, la fin du
// live et l'entrée écoutée. Le test pose les réponses et lit les appels.
const setup = (overrides: { settings?: Partial<ControlSettings>; obs?: ObsControlState } = {}) => {
  const clock = { now: START };
  const obsListeners = new Set<() => void>();
  const broadcastListeners = new Set<(broadcast: Broadcast) => void>();
  const viewerListeners = new Set<(state: ViewersState) => void>();
  const phoneListeners = new Set<(phones: PhoneSummary[]) => void>();
  const world = {
    obs: overrides.obs ?? LINKED,
    viewers: { kind: "unknown" } as ViewersState,
    phones: [] as PhoneSummary[],
    sceneResult: { ok: true } as ShowSceneResult,
    muteResult: { ok: true } as ShowSceneResult,
    stopResult: { ok: true } as ShowSceneResult,
    pictureResult: { ok: true } as ShowSceneResult,
    chatResult: { ok: true } as Awaited<ReturnType<ChatWriterPort["send"]>>,
    chatViewersResult: { ok: true, chatViewers: [] } as Awaited<ReturnType<ChatViewersPort["list"]>>,
    endResult: { ok: true } as { ok: true } | { ok: false; message: string },
    // Une lecture d'OBS qui attend qu'on la lève : de quoi faire croiser deux lectures.
    hold: null as Promise<void> | null,
  };
  const calls = {
    scenes: [] as string[],
    mutes: [] as string[],
    stops: 0,
    pictures: [] as string[],
    chatViewerReads: 0,
    messages: [] as string[],
    ends: [] as (number | null)[],
    listened: [] as string[],
    pcNames: [] as string[],
  };
  const logs: string[] = [];
  const states: ControlState[] = [];
  const timers: { at: number; callback: () => void }[] = [];
  const control = createControl({
    obs: {
      subscribe(listener) {
        obsListeners.add(listener);
        return () => obsListeners.delete(listener);
      },
      async getState(pcName) {
        calls.pcNames.push(pcName);
        // L'état tel qu'il était à la demande, rendu quand `hold` (posé à ce moment) se lève.
        const asked = world.obs;
        const gate = world.hold;
        if (gate) await gate;
        return asked;
      },
      async updateProgramScene(name) {
        calls.scenes.push(name);
        return world.sceneResult;
      },
      async updateInputMute(input, isMuted) {
        calls.mutes.push(`${input}:${isMuted ? "coupé" : "ouvert"}`);
        return world.muteResult;
      },
      async stopStream() {
        calls.stops += 1;
        return world.stopResult;
      },
      // Comme OBS : le membre choisi devient le seul visible de la place, et l'évènement part.
      async updatePicture(id) {
        calls.pictures.push(id);
        if (world.pictureResult.ok) {
          world.obs = {
            ...world.obs,
            picture: world.obs.picture.map((member) => ({ ...member, isVisible: member.id === id })),
          };
          for (const listener of obsListeners) listener();
        }
        return world.pictureResult;
      },
    },
    broadcast: {
      subscribe(listener) {
        broadcastListeners.add(listener);
        return () => broadcastListeners.delete(listener);
      },
    },
    viewers: {
      getState: () => world.viewers,
      subscribe(listener) {
        viewerListeners.add(listener);
        return () => viewerListeners.delete(listener);
      },
    },
    phones: {
      getState: () => world.phones,
      subscribe(listener) {
        phoneListeners.add(listener);
        return () => phoneListeners.delete(listener);
      },
    },
    chat: {
      async send(text) {
        calls.messages.push(text);
        return world.chatResult;
      },
    },
    chatViewers: {
      async list() {
        calls.chatViewerReads += 1;
        return world.chatViewersResult;
      },
    },
    end: {
      update(endAt) {
        calls.ends.push(endAt);
        return world.endResult;
      },
    },
    settings: { micName: "Mic/Aux", ...overrides.settings },
    listen: (input) => calls.listened.push(input),
    clock: () => clock.now,
    schedule(callback, ms) {
      const timer = { at: clock.now + ms, callback };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    log: (line) => logs.push(line),
  });
  control.subscribe((state) => states.push(state));
  const settle = async () => {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  };
  // Le temps passe : les minuteries échues partent, dans l'ordre, et leurs suites se règlent (un repli enchaîne l'image, puis le micro).
  const advance = async (ms: number) => {
    clock.now += ms;
    for (const timer of timers.filter(({ at }) => at <= clock.now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.callback();
      for (let turn = 0; turn < 60; turn += 1) await Promise.resolve();
    }
  };
  // OBS change : son état se relit, puis part aux abonnés.
  const updateObs = async (next: ObsControlState) => {
    world.obs = next;
    for (const listener of obsListeners) listener();
    await settle();
  };
  const updatePhones = (phones: PhoneSummary[]) => {
    world.phones = phones;
    for (const listener of phoneListeners) listener(phones);
  };
  const cameraPhone = (number: number, isReceiving = true): PhoneSummary => ({
    id: `phone-000${number}`,
    role: "camera",
    number,
    hasScreen: true,
    isReceiving,
  });
  return {
    control,
    world,
    calls,
    logs,
    states,
    clock,
    settle,
    advance,
    timers,
    updateObs,
    updatePhones,
    cameraPhone,
    broadcastListeners,
    viewerListeners,
  };
};

describe("l'état de la régie", () => {
  it("est celui d'OBS hors ligne tant qu'il n'a rien lu : rien à l'antenne, aucune scène, un seul micro sans entrée", () => {
    const { control } = setup();
    expect(control.getState()).toEqual({
      isLinked: false,
      broadcast: { isLive: false, durationMs: 0 },
      viewers: { kind: "unknown" },
      scene: null,
      scenes: [],
      mics: [{ id: "pc", label: "Micro du PC", isOpen: false, isAvailable: false }],
      onAir: [],
      endAt: null,
      picture: { members: [], currentId: null },
    });
    expect(OBS_OFFLINE.isLinked).toBe(false);
  });

  it("donne les caméras à l'antenne d'après OBS, et prévient quand une caméra entre dans la scène du programme ou en sort", async () => {
    const { control, updateObs, settle, states } = setup();
    control.start();
    await settle();
    expect(control.getState().onAir).toEqual([2]);
    await updateObs({ ...LINKED, onAir: [1, 2] });
    await updateObs({ ...LINKED, onAir: [] });
    expect(states.map(({ onAir }) => onAir)).toEqual([[2], [1, 2], []]);
  });

  it("n'a aucune caméra à l'antenne quand OBS n'est plus joint", async () => {
    const { control, updateObs, settle } = setup();
    control.start();
    await settle();
    await updateObs(OBS_OFFLINE);
    expect(control.getState().onAir).toEqual([]);
  });

  it("Quand le serveur démarre, le système doit lire OBS avec le nom du mic du PC, et donner la scène, les scènes et le mic", async () => {
    const { control, calls, settle, states } = setup();
    control.start();
    await settle();
    expect(calls.pcNames).toEqual(["Mic/Aux"]);
    expect(control.getState()).toMatchObject({
      isLinked: true,
      scene: "Jeu",
      scenes: ["Jeu", "Pause"],
      mics: [{ id: "pc", label: "Micro du PC", isOpen: true, isAvailable: true }],
    });
    expect(states).toHaveLength(1);
  });

  it("Quand OBS change de scène, le système doit prévenir les abonnés avec la nouvelle", async () => {
    const { control, updateObs, settle, states } = setup();
    control.start();
    await settle();
    await updateObs({ ...LINKED, scene: "Pause" });
    expect(states.map(({ scene }) => scene)).toEqual(["Jeu", "Pause"]);
  });

  it("garde le dernier état quand deux lectures d'OBS se croisent : la plus ancienne ne remplace pas la plus récente", async () => {
    const { control, updateObs, world, settle } = setup();
    control.start();
    await settle();
    let release: () => void = () => undefined;
    world.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await updateObs({ ...LINKED, scene: "Pause" });
    world.hold = null;
    await updateObs({ ...LINKED, scene: "Jeu" });
    release();
    await settle();
    expect(control.getState().scene).toBe("Jeu");
  });

  it("dit hors ligne quand OBS n'est pas joint, même si la diffusion était en cours", async () => {
    const { control, updateObs, settle, broadcastListeners } = setup();
    control.start();
    await settle();
    for (const listener of broadcastListeners) listener({ isLive: true, duration: 5000 });
    expect(control.getState().broadcast.isLive).toBe(true);
    await updateObs(OBS_OFFLINE);
    expect(control.getState()).toMatchObject({
      isLinked: false,
      broadcast: { isLive: false, durationMs: 0 },
      scene: null,
    });
  });
});

describe("la diffusion", () => {
  it("donne la durée du live au moment où l'état part, en ajoutant le temps passé depuis que le serveur l'a su", async () => {
    const { control, settle, clock, broadcastListeners } = setup();
    control.start();
    await settle();
    for (const listener of broadcastListeners) listener({ isLive: true, duration: 102_000 });
    clock.now += 3000;
    expect(control.getState().broadcast).toEqual({ isLive: true, durationMs: 105_000 });
  });

  it("repart de zéro au démarrage du live, et s'arrête avec lui", async () => {
    const { control, settle, states, clock, broadcastListeners } = setup();
    control.start();
    await settle();
    for (const listener of broadcastListeners) listener({ isLive: true, duration: 0 });
    clock.now += 61_000;
    for (const listener of broadcastListeners) listener({ isLive: false, duration: 0 });
    expect(states.map(({ broadcast }) => broadcast)).toEqual([
      { isLive: false, durationMs: 0 },
      { isLive: true, durationMs: 0 },
      { isLive: false, durationMs: 0 },
    ]);
  });
});

describe("les viewers et la fin prévue", () => {
  it("prévient les abonnés quand les viewers changent, et montre ce que le usecase des viewers sait", async () => {
    const { control, world, settle, states, viewerListeners } = setup();
    control.start();
    await settle();
    world.viewers = { kind: "live", count: 12 };
    for (const listener of viewerListeners) listener(world.viewers);
    expect(states.at(-1)?.viewers).toEqual({ kind: "live", count: 12 });
  });

  it("montre la fin prévue des réglages, et prévient quand elle change", async () => {
    const endAt = START + 2 * 3_600_000;
    const { control, settle, states } = setup({ settings: { foxEndAt: toInstantText(endAt) } });
    control.start();
    await settle();
    expect(control.getState().endAt).toBe(endAt);
    control.update({ micName: "Mic/Aux", foxEndAt: toInstantText(endAt + 600_000) });
    expect(states.at(-1)?.endAt).toBe(endAt + 600_000);
    control.update({ micName: "Mic/Aux", foxEndAt: "" });
    expect(states.at(-1)?.endAt).toBeNull();
  });

  it("ne prévient personne quand un réglage change qui n'est ni la fin ni le nom du mic (un curseur glissé)", async () => {
    const { control, settle, states } = setup();
    control.start();
    await settle();
    control.update({ micName: "Mic/Aux" });
    control.update({ micName: "Mic/Aux" });
    expect(states).toHaveLength(1);
  });
});

describe("les micros des caméras connectées", () => {
  it("ajoute le mic de chaque téléphone qui a une caméra, et le retire quand le téléphone part", async () => {
    const { control, settle, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([
      cameraPhone(2),
      { id: "phone-9999", role: "control", number: null, hasScreen: false, isReceiving: false },
    ]);
    expect(control.getState().mics.map(({ id }) => id)).toEqual(["pc", "camera-2"]);
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    expect(control.getState().mics.map(({ id }) => id)).toEqual(["pc", "camera-1", "camera-2"]);
    updatePhones([]);
    expect(control.getState().mics.map(({ id }) => id)).toEqual(["pc"]);
  });

  it("dit indisponible le mic d'une caméra dont la source n'existe pas dans OBS", async () => {
    const { control, settle, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(7)]);
    expect(control.getState().mics[1]).toEqual({
      id: "camera-7",
      label: "Caméra 7",
      isOpen: false,
      isAvailable: false,
    });
  });
});

describe("l'entrée que la tête et Jean-Renard écoutent", () => {
  it("reste celle du PC tant que son mic est ouvert : le système n'appelle rien", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    expect(calls.listened).toEqual([]);
  });

  it("Quand le mic d'une caméra s'ouvre et celui du PC se coupe, le système doit faire écouter l'entrée de la caméra", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs, logs } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    await updateObs({
      ...LINKED,
      isPcMuted: true,
      cameras: [{ number: 1, input: "Camera 1 OBS", isMuted: false }],
    });
    expect(calls.listened).toEqual(["Camera 1 OBS"]);
    expect(logs).toContain("Régie : la tête et Jean-Renard écoutent « Camera 1 OBS ».");
  });

  it("Quand le mic du PC se rouvre, le système doit faire revenir l'écoute à l'entrée des réglages", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    await updateObs({
      ...LINKED,
      isPcMuted: true,
      cameras: [{ number: 1, input: "Camera 1 OBS", isMuted: false }],
    });
    await updateObs({
      ...LINKED,
      isPcMuted: false,
      cameras: [{ number: 1, input: "Camera 1 OBS", isMuted: true }],
    });
    expect(calls.listened).toEqual(["Camera 1 OBS", "Mic/Aux"]);
  });

  it("Si le téléphone dont le mic est ouvert se déconnecte, alors l'écoute doit revenir à l'entrée du PC", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    await updateObs({
      ...LINKED,
      isPcMuted: true,
      cameras: [{ number: 1, input: "Camera 1 OBS", isMuted: false }],
    });
    updatePhones([]);
    expect(calls.listened).toEqual(["Camera 1 OBS", "Mic/Aux"]);
  });

  it("n'écrase pas l'entrée de la caméra quand un réglage change, mais suit un autre nom de mic quand celui du PC est ouvert", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs } = setup();
    control.start();
    await settle();
    control.update({ micName: "Autre mic" });
    await settle();
    expect(calls.listened).toEqual(["Autre mic"]);
    expect(calls.pcNames.at(-1)).toBe("Autre mic");
    updatePhones([cameraPhone(1)]);
    await updateObs({
      ...LINKED,
      isPcMuted: true,
      cameras: [{ number: 1, input: "Camera 1 OBS", isMuted: false }],
    });
    control.update({ micName: "Autre mic", foxEndAt: toInstantText(START + 600_000) });
    expect(calls.listened).toEqual(["Autre mic", "Camera 1 OBS"]);
  });
});

describe("ouvrir un micro", () => {
  it("Quand une touche de micro est pressée, le système doit couper les autres entrées ouvertes d'abord, puis ouvrir celle-ci", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    expect(await control.updateMic("camera-1")).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Mic/Aux:coupé", "Camera 1 OBS:ouvert"]);
  });

  it("ouvre le mic du PC en coupant celui d'une caméra ouverte", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    await updateObs({
      ...LINKED,
      isPcMuted: true,
      cameras: [
        { number: 1, input: "Camera 1 OBS", isMuted: false },
        { number: 2, input: "Camera 2 OBS", isMuted: true },
      ],
    });
    expect(await control.updateMic("pc")).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("refuse (404) un micro que la régie n'a pas", async () => {
    const { control, settle, calls } = setup();
    control.start();
    await settle();
    expect(await control.updateMic("camera-9")).toEqual({ ok: false, status: 404, message: "micro inconnu" });
    expect(calls.mutes).toEqual([]);
  });

  it("Si la source OBS de la caméra n'existe pas, alors le système doit refuser (409) en disant où la créer, sans rien couper", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(7)]);
    expect(await control.updateMic("camera-7")).toEqual({
      ok: false,
      status: 409,
      message:
        "la source OBS de Caméra 7 est introuvable : crée-la avec l'adresse de l'onglet Mobile, « Contrôler l'audio via OBS » cochée",
    });
    expect(calls.mutes).toEqual([]);
  });

  it("refuse (409) le mic du PC quand OBS ne connaît pas son entrée, en la nommant", async () => {
    const { control, settle, calls } = setup({ obs: { ...LINKED, isPcMuted: null } });
    control.start();
    await settle();
    expect(await control.updateMic("pc")).toEqual({
      ok: false,
      status: 409,
      message: "l'entrée « Mic/Aux » est introuvable dans OBS : vérifie micName dans settings.json",
    });
    expect(calls.mutes).toEqual([]);
  });

  it("Si OBS refuse une coupure, alors le système doit rendre son refus (409) et ne pas ouvrir le micro", async () => {
    const { control, settle, calls, world, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    world.muteResult = { ok: false, reason: "OBS n'est pas connecté" };
    expect(await control.updateMic("camera-1")).toEqual({
      ok: false,
      status: 409,
      message: "OBS n'est pas connecté",
    });
    expect(calls.mutes).toEqual(["Mic/Aux:coupé"]);
  });

  it("dit dans le journal quel micro s'ouvre et combien d'entrées se coupent", async () => {
    const { control, settle, logs, updatePhones, cameraPhone } = setup();
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    await control.updateMic("camera-1");
    expect(logs).toContain("Régie : micro « Caméra 1 » ouvert, 1 entrée coupée.");
  });
});

describe("Muet : fermer tous les micros", () => {
  // PC et caméra 1 ouverts, caméra 2 coupée : OBS laisse deux micros ouverts, comme quand Alexis les a ouverts à la main.
  const TWO_OPEN: ObsControlState = {
    ...LINKED,
    cameras: [
      { number: 1, input: "Camera 1 OBS", isMuted: false },
      { number: 2, input: "Camera 2 OBS", isMuted: true },
    ],
  };
  const ALL_MUTED: ObsControlState = {
    ...LINKED,
    isPcMuted: true,
    cameras: [
      { number: 1, input: "Camera 1 OBS", isMuted: true },
      { number: 2, input: "Camera 2 OBS", isMuted: true },
    ],
  };

  it("Quand la régie choisit Muet, le système doit fermer tous les micros et l'état doit n'avoir aucun micro ouvert", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, updateObs } = setup({ obs: TWO_OPEN });
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    expect(
      control
        .getState()
        .mics.filter(({ isOpen }) => isOpen)
        .map(({ id }) => id),
    ).toEqual(["pc", "camera-1"]);
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Mic/Aux:coupé", "Camera 1 OBS:coupé"]);
    await updateObs(ALL_MUTED);
    expect(control.getState().mics.some(({ isOpen }) => isOpen)).toBe(false);
    expect(control.getState().mics).toHaveLength(3);
  });

  it("ne coupe que les entrées ouvertes et n'ouvre aucune entrée", async () => {
    const { control, settle, calls } = setup();
    control.start();
    await settle();
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Mic/Aux:coupé"]);
    expect(calls.mutes.some((call) => call.endsWith(":ouvert"))).toBe(false);
  });

  it("n'appelle pas OBS quand tout est déjà fermé, et répond que c'est fait", async () => {
    const { control, settle, calls } = setup({ obs: ALL_MUTED });
    control.start();
    await settle();
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({ ok: true });
    expect(calls.mutes).toEqual([]);
  });

  it("coupe aussi la source d'une caméra restée ouverte dans OBS dont le téléphone est parti", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({
      obs: { ...TWO_OPEN, isPcMuted: true },
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(2)]);
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé"]);
  });

  it("Si OBS refuse une coupure, alors le système doit rendre son refus (409)", async () => {
    const { control, settle, world } = setup({ obs: TWO_OPEN });
    control.start();
    await settle();
    world.muteResult = { ok: false, reason: "OBS refuse la coupure" };
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({
      ok: false,
      status: 409,
      message: "OBS refuse la coupure",
    });
  });

  it("Si OBS n'est pas joint, alors le système doit refuser (409) sans rien couper : Muet ne se prétend pas fait", async () => {
    const { control, settle, calls } = setup({ obs: OBS_OFFLINE });
    control.start();
    await settle();
    expect(await control.updateMic(MUTE_MIC_ID)).toEqual({
      ok: false,
      status: 409,
      message: "OBS n'est pas connecté",
    });
    expect(calls.mutes).toEqual([]);
  });

  it("dit dans le journal combien d'entrées se coupent", async () => {
    const { control, settle, logs, updatePhones, cameraPhone } = setup({ obs: TWO_OPEN });
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    await control.updateMic(MUTE_MIC_ID);
    expect(logs).toContain("Régie : Muet, 2 entrées coupées.");
  });
});

// La place avec ce membre seul visible.
const shown = (id: string): ObsControlState["picture"] =>
  PLACE.map((member) => ({ ...member, isVisible: member.id === id }));

// La caméra 1 à l'image, son mic ouvert (celui du PC coupé) : le live comme il est quand Alexis a pris la caméra du téléphone.
const CAMERA_ON_AIR: ObsControlState = {
  ...LINKED,
  isPcMuted: true,
  cameras: [
    { number: 1, input: "Camera 1 OBS", isMuted: false },
    { number: 2, input: "Camera 2 OBS", isMuted: true },
  ],
  picture: shown("camera-1"),
};

describe("l'image de la place caméra : l'état", () => {
  it("donne les membres dans l'ordre PC, caméras, tête, avec celui que montre OBS et la disponibilité des caméras", async () => {
    const { control, settle, updatePhones, cameraPhone } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(2, false), cameraPhone(1)]);
    expect(control.getState().picture).toEqual({
      members: [
        { id: "pc", label: "PC", isAvailable: true },
        { id: "camera-1", label: "Caméra 1", isAvailable: true },
        { id: "camera-2", label: "Caméra 2", isAvailable: false },
        { id: "head", label: "Tête", isAvailable: true },
      ],
      currentId: "pc",
    });
  });

  it("n'a ni membre ni image quand OBS n'a pas la place ou n'est pas joint", async () => {
    const { control, settle, updateObs } = setup();
    control.start();
    await settle();
    expect(control.getState().picture).toEqual({ members: [], currentId: null });
    await updateObs(OBS_OFFLINE);
    expect(control.getState().picture).toEqual({ members: [], currentId: null });
  });

  it("suit OBS quand Alexis change la visibilité à la main, sans toucher au micro", async () => {
    const { control, settle, updateObs, calls, states } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    await updateObs({ ...WITH_PICTURE, picture: shown("head") });
    expect(control.getState().picture.currentId).toBe("head");
    await updateObs({ ...WITH_PICTURE, picture: shown("camera-2") });
    expect(states.map(({ picture }) => picture.currentId)).toEqual(["pc", "head", "camera-2"]);
    expect(calls.mutes).toEqual([]);
    expect(calls.pictures).toEqual([]);
  });

  it("prend le premier membre visible dans l'ordre de la place quand OBS en laisse plusieurs", async () => {
    const picture = PLACE.map((member) => ({ ...member, isVisible: member.id !== "pc" }));
    const { control, settle } = setup({ obs: { ...WITH_PICTURE, picture } });
    control.start();
    await settle();
    expect(control.getState().picture.currentId).toBe("head");
  });
});

describe("choisir l'image", () => {
  it("montre le membre choisi dans OBS, et le micro de cette caméra devient celui du live", async () => {
    const { control, settle, calls, updatePhones, cameraPhone, logs } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    expect(await control.updatePicture("camera-1")).toEqual({ ok: true });
    await settle();
    expect(calls.pictures).toEqual(["camera-1"]);
    expect(calls.mutes).toEqual(["Mic/Aux:coupé", "Camera 1 OBS:ouvert"]);
    expect(control.getState().picture.currentId).toBe("camera-1");
    expect(logs).toContain("Régie : Caméra 1 est à l'image.");
  });

  it("rend le micro au PC quand l'image passe au PC ou à la tête", async () => {
    for (const id of ["pc", "head"]) {
      const { control, settle, calls, updatePhones, cameraPhone } = setup({ obs: CAMERA_ON_AIR });
      control.start();
      await settle();
      updatePhones([cameraPhone(1)]);
      expect(await control.updatePicture(id), id).toEqual({ ok: true });
      expect(calls.pictures, id).toEqual([id]);
      expect(calls.mutes, id).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
    }
  });

  it("montre le PC sans couper aucune entrée quand son mic est déjà le seul ouvert", async () => {
    const { control, settle, calls } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    expect(await control.updatePicture("pc")).toEqual({ ok: true });
    expect(calls.mutes).toEqual(["Mic/Aux:ouvert"]);
  });

  it("refuse (404) un membre que la place n'a pas, sans rien demander à OBS", async () => {
    const { control, settle, calls } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    expect(await control.updatePicture("camera-9")).toEqual({
      ok: false,
      status: 404,
      message: "Caméra 9 n'est pas dans la place caméra d'OBS",
    });
    expect(calls.pictures).toEqual([]);
    expect(calls.mutes).toEqual([]);
  });

  it("refuse (409) tout choix quand OBS n'a pas la place caméra, en disant quoi vérifier", async () => {
    const { control, settle, calls } = setup();
    control.start();
    await settle();
    expect(await control.updatePicture("pc")).toEqual({
      ok: false,
      status: 409,
      message: "OBS n'a pas de place caméra : vérifie cameraSlotScene dans settings.json",
    });
    expect(calls.pictures).toEqual([]);
  });

  it("refuse (409) une caméra dont le téléphone ne filme pas vers OBS, sans rien demander à OBS", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    expect(await control.updatePicture("camera-1")).toEqual({
      ok: false,
      status: 409,
      message: "Caméra 1 n'est pas disponible : son téléphone ne filme pas vers OBS",
    });
    expect(calls.pictures).toEqual([]);
    expect(calls.mutes).toEqual([]);
  });

  it("refuse (409) avec la raison d'OBS quand il ne change pas l'image, et ne touche pas au micro", async () => {
    const { control, settle, calls, world, logs } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    world.pictureResult = { ok: false, reason: "la scène « Master - Webcam » n'existe pas dans OBS" };
    expect(await control.updatePicture("head")).toEqual({
      ok: false,
      status: 409,
      message: "la scène « Master - Webcam » n'existe pas dans OBS",
    });
    expect(calls.mutes).toEqual([]);
    expect(logs).toContain(
      "Régie : l'image ne passe pas à Tête (la scène « Master - Webcam » n'existe pas dans OBS).",
    );
  });

  it("laisse l'image à la caméra choisie quand son micro manque dans OBS, et le dit dans le refus", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({
      obs: { ...WITH_PICTURE, cameras: [] },
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    expect(await control.updatePicture("camera-1")).toEqual({
      ok: false,
      status: 409,
      message:
        "l'image est passée à Caméra 1, mais la source OBS de Caméra 1 est introuvable : crée-la avec l'adresse de l'onglet Mobile, « Contrôler l'audio via OBS » cochée",
    });
    expect(calls.pictures).toEqual(["camera-1"]);
  });

  it("prévient les abonnés de la nouvelle image quand OBS l'a changée", async () => {
    const { control, settle, updatePhones, cameraPhone, states } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(2)]);
    await control.updatePicture("camera-2");
    await settle();
    expect(states.at(-1)?.picture.currentId).toBe("camera-2");
  });
});

describe("le repli de l'image sur la tête", () => {
  it("passe l'image à la tête et le micro au PC quand le téléphone de la caméra à l'image ne filme plus depuis 3 s", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, logs } = setup({
      obs: CAMERA_ON_AIR,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([cameraPhone(1, false)]);
    await advance(2999);
    expect(calls.pictures).toEqual([]);
    await advance(1);
    expect(calls.pictures).toEqual(["head"]);
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
    expect(control.getState().picture.currentId).toBe("head");
    expect(logs).toContain("Régie : Caméra 1 ne filme plus vers OBS depuis 3 s, l'image se replie.");
  });

  it("se déclenche aussi quand le téléphone se déconnecte", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs: CAMERA_ON_AIR });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([]);
    await advance(3000);
    expect(calls.pictures).toEqual(["head"]);
  });

  it("se déclenche aussi quand OBS montre à la main une caméra qui ne filme pas, 3 s après", async () => {
    const { control, settle, advance, calls, updateObs } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    await updateObs({ ...WITH_PICTURE, picture: shown("camera-2") });
    await advance(3000);
    expect(calls.pictures).toEqual(["head"]);
  });

  it("n'a rien à faire quand le téléphone revient avant les 3 s", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, timers } = setup({
      obs: CAMERA_ON_AIR,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([cameraPhone(1, false)]);
    await advance(2000);
    updatePhones([cameraPhone(1)]);
    expect(timers).toHaveLength(0);
    await advance(10_000);
    expect(calls.pictures).toEqual([]);
  });

  it("ne revient pas toute seule à la caméra quand son téléphone revient", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs: CAMERA_ON_AIR });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    await advance(3000);
    updatePhones([cameraPhone(1)]);
    await advance(60_000);
    await settle();
    expect(calls.pictures).toEqual(["head"]);
    expect(control.getState().picture.currentId).toBe("head");
  });

  it("n'attend rien quand l'image est le PC ou la tête, même si une autre caméra ne filme pas", async () => {
    const { control, settle, updatePhones, cameraPhone, timers, updateObs } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false), cameraPhone(2, false)]);
    expect(timers).toHaveLength(0);
    await updateObs({ ...WITH_PICTURE, picture: shown("head") });
    expect(timers).toHaveLength(0);
  });

  it("ne programme qu'un seul repli, même quand l'état est redit plusieurs fois", async () => {
    const { control, settle, updatePhones, cameraPhone, timers, viewerListeners, world } = setup({
      obs: CAMERA_ON_AIR,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    for (const listener of viewerListeners) listener(world.viewers);
    updatePhones([cameraPhone(1, false)]);
    expect(timers).toHaveLength(1);
  });

  it("n'insiste pas quand OBS refuse le repli : un seul essai tant que la caméra reste à l'image", async () => {
    const { control, settle, advance, calls, world, updatePhones, cameraPhone, logs } = setup({
      obs: CAMERA_ON_AIR,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    world.pictureResult = { ok: false, reason: "OBS n'est pas connecté" };
    await advance(3000);
    await advance(60_000);
    expect(calls.pictures).toEqual(["head"]);
    expect(logs).toContain("Régie : le repli de l'image a échoué (OBS n'est pas connecté).");
  });

  it("replie sur le PC quand la place n'a pas de tête", async () => {
    const withoutHead = CAMERA_ON_AIR.picture.filter(({ id }) => id !== "head");
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({
      obs: { ...CAMERA_ON_AIR, picture: withoutHead },
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    await advance(3000);
    expect(calls.pictures).toEqual(["pc"]);
  });

  it("ne fait rien quand le serveur est arrêté avant les 3 s", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs: CAMERA_ON_AIR });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    control.stop();
    await advance(10_000);
    expect(calls.pictures).toEqual([]);
  });
});

describe("la touche Image du Stream Deck", () => {
  it("passe au membre suivant : PC, les caméras par numéro, la tête, puis PC", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    for (let press = 0; press < 5; press += 1) {
      expect(await control.updatePictureNext()).toEqual({ ok: true });
      await settle();
    }
    expect(calls.pictures).toEqual(["camera-1", "camera-2", "head", "pc", "camera-1"]);
  });

  it("saute une caméra dont le téléphone ne filme pas", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false), cameraPhone(2)]);
    for (let press = 0; press < 3; press += 1) {
      await control.updatePictureNext();
      await settle();
    }
    expect(calls.pictures).toEqual(["camera-2", "head", "pc"]);
  });

  it("rend le micro au PC en passant à la tête, comme un choix dans le menu", async () => {
    const { control, settle, calls, updatePhones, cameraPhone } = setup({
      obs: { ...CAMERA_ON_AIR, picture: shown("camera-2") },
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    await control.updatePictureNext();
    expect(calls.pictures).toEqual(["head"]);
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("refuse (409) quand la place n'a aucune image à choisir", async () => {
    const { control, settle, calls } = setup();
    control.start();
    await settle();
    expect(await control.updatePictureNext()).toEqual({
      ok: false,
      status: 409,
      message: "aucune image à choisir",
    });
    expect(calls.pictures).toEqual([]);
  });
});

describe("couper la caméra d'un téléphone : la tête prend l'image, le micro reste", () => {
  it("passe l'image à la tête sans toucher au micro avec isMicKept, alors que le choix de la tête dans le menu rend le micro au PC", async () => {
    const kept = setup({ obs: CAMERA_ON_AIR });
    kept.control.start();
    await kept.settle();
    kept.updatePhones([kept.cameraPhone(1)]);
    expect(await kept.control.updatePicture("head", { isMicKept: true })).toEqual({ ok: true });
    await kept.settle();
    expect(kept.calls.pictures).toEqual(["head"]);
    expect(kept.calls.mutes).toEqual([]);
    expect(kept.control.getState().picture.currentId).toBe("head");
    expect(kept.control.getState().mics.find((mic) => mic.isOpen)?.id).toBe("camera-1");

    const menu = setup({ obs: CAMERA_ON_AIR });
    menu.control.start();
    await menu.settle();
    menu.updatePhones([menu.cameraPhone(1)]);
    expect(await menu.control.updatePicture("head")).toEqual({ ok: true });
    expect(menu.calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("garde le micro même quand le téléphone n'a pas de source audio dans OBS : l'image seule change", async () => {
    const made = setup({ obs: { ...CAMERA_ON_AIR, cameras: [] } });
    made.control.start();
    await made.settle();
    made.updatePhones([made.cameraPhone(1)]);
    expect(await made.control.updatePicture("head", { isMicKept: true })).toEqual({ ok: true });
    expect(made.calls.mutes).toEqual([]);
  });

  it("refuse comme d'habitude quand OBS refuse ou que la place manque, et ne touche pas au micro", async () => {
    const made = setup({ obs: CAMERA_ON_AIR });
    made.control.start();
    await made.settle();
    made.updatePhones([made.cameraPhone(1)]);
    made.world.pictureResult = { ok: false, reason: "OBS n'est pas connecté" };
    expect(await made.control.updatePicture("head", { isMicKept: true })).toEqual({
      ok: false,
      status: 409,
      message: "OBS n'est pas connecté",
    });
    expect(made.calls.mutes).toEqual([]);
    const noPlace = setup();
    noPlace.control.start();
    await noPlace.settle();
    expect(await noPlace.control.updatePicture("head", { isMicKept: true })).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("remet ensuite la caméra à l'image et reprend son micro : le bouton fait l'aller et le retour", async () => {
    const made = setup({ obs: CAMERA_ON_AIR });
    made.control.start();
    await made.settle();
    made.updatePhones([made.cameraPhone(1)]);
    await made.control.updatePicture("head", { isMicKept: true });
    await made.settle();
    expect(made.control.getState().picture.currentId).toBe("head");
    expect(await made.control.updatePicture("camera-1")).toEqual({ ok: true });
    await made.settle();
    expect(made.calls.pictures).toEqual(["head", "camera-1"]);
    expect(made.control.getState().picture.currentId).toBe("camera-1");
    expect(made.calls.mutes).toEqual(["Camera 1 OBS:ouvert"]);
  });
});

describe("le micro du live d'un téléphone qui ne filme plus", () => {
  const headOnAir: ObsControlState = { ...CAMERA_ON_AIR, picture: shown("head") };

  it("revient au PC au bout de 3 s, sans toucher à l'image : la tête reste à l'image", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, logs } = setup({ obs: headOnAir });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([cameraPhone(1, false)]);
    await advance(2999);
    expect(calls.mutes).toEqual([]);
    await advance(1);
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
    expect(calls.pictures).toEqual([]);
    expect(logs).toContain(
      "Régie : le micro de Caméra 1 ne filme plus vers OBS depuis 3 s, il revient au PC.",
    );
  });

  it("revient aussi quand le téléphone se déconnecte", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs: headOnAir });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([]);
    await advance(3000);
    // La source du téléphone parti n'est plus dans la liste des micros, mais elle reste ouverte dans OBS : elle se coupe avec l'ouverture du PC.
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("ne reprend pas le micro au PC quand Alexis a coupé le sien à la main et que le téléphone part ensuite", async () => {
    const muted: ObsControlState = {
      ...CAMERA_ON_AIR,
      cameras: [
        { number: 1, input: "Camera 1 OBS", isMuted: true },
        { number: 2, input: "Camera 2 OBS", isMuted: true },
      ],
      picture: shown("head"),
    };
    const { control, settle, advance, calls, updatePhones, cameraPhone, timers } = setup({ obs: muted });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([]);
    expect(timers).toHaveLength(0);
    await advance(10_000);
    expect(calls.mutes).toEqual([]);
  });

  it("oublie la caméra du micro quand Alexis coupe sa source à la main : son téléphone qui part ensuite ne rouvre pas le PC", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, updateObs, timers } = setup({
      obs: headOnAir,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    await updateObs({
      ...headOnAir,
      cameras: [
        { number: 1, input: "Camera 1 OBS", isMuted: true },
        { number: 2, input: "Camera 2 OBS", isMuted: true },
      ],
    });
    updatePhones([]);
    expect(timers).toHaveLength(0);
    await advance(10_000);
    expect(calls.mutes).toEqual([]);
  });

  it("n'a rien à faire quand le téléphone revient avant les 3 s, et ne reprend pas le micro quand il revient après", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, timers } = setup({ obs: headOnAir });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    await advance(2000);
    updatePhones([cameraPhone(1)]);
    expect(timers).toHaveLength(0);
    await advance(10_000);
    expect(calls.mutes).toEqual([]);
    updatePhones([cameraPhone(1, false)]);
    await advance(3000);
    updatePhones([cameraPhone(1)]);
    await advance(60_000);
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("ne fait qu'une demande quand la caméra est aussi à l'image : le repli de l'image rend le micro avec elle", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone, timers } = setup({
      obs: CAMERA_ON_AIR,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1)]);
    updatePhones([cameraPhone(1, false)]);
    expect(timers).toHaveLength(1);
    await advance(3000);
    expect(calls.pictures).toEqual(["head"]);
    expect(calls.mutes).toEqual(["Camera 1 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("ne touche pas à l'image quand le micro est celui d'une autre caméra que celle à l'image", async () => {
    const obs: ObsControlState = {
      ...CAMERA_ON_AIR,
      cameras: [
        { number: 1, input: "Camera 1 OBS", isMuted: true },
        { number: 2, input: "Camera 2 OBS", isMuted: false },
      ],
      picture: shown("camera-1"),
    };
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs });
    control.start();
    await settle();
    updatePhones([cameraPhone(1), cameraPhone(2)]);
    updatePhones([cameraPhone(1), cameraPhone(2, false)]);
    await advance(3000);
    expect(calls.pictures).toEqual([]);
    expect(calls.mutes).toEqual(["Camera 2 OBS:coupé", "Mic/Aux:ouvert"]);
  });

  it("n'attend rien quand le micro du live est celui du PC, même si le téléphone d'une caméra ne filme pas", async () => {
    const { control, settle, updatePhones, cameraPhone, timers } = setup({ obs: WITH_PICTURE });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false), cameraPhone(2, false)]);
    expect(timers).toHaveLength(0);
  });

  it("n'insiste pas quand OBS refuse : un seul essai tant que la caméra garde le micro sans filmer", async () => {
    const { control, settle, advance, calls, world, updatePhones, cameraPhone, logs } = setup({
      obs: headOnAir,
    });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    world.muteResult = { ok: false, reason: "OBS n'est pas connecté" };
    await advance(3000);
    const attempts = calls.mutes.length;
    await advance(60_000);
    expect(calls.mutes).toHaveLength(attempts);
    expect(logs.some((line) => line.startsWith("Régie : le retour du micro au PC a échoué"))).toBe(true);
  });

  it("ne fait plus rien quand le serveur est arrêté avant les 3 s", async () => {
    const { control, settle, advance, calls, updatePhones, cameraPhone } = setup({ obs: headOnAir });
    control.start();
    await settle();
    updatePhones([cameraPhone(1, false)]);
    control.stop();
    await advance(10_000);
    expect(calls.mutes).toEqual([]);
  });
});

describe("passer une scène à l'antenne", () => {
  it("demande la scène à OBS", async () => {
    const { control, calls } = setup();
    expect(await control.updateScene("Pause")).toEqual({ ok: true });
    expect(calls.scenes).toEqual(["Pause"]);
  });

  it("Si OBS refuse, alors le système doit rendre son refus (409) tel quel", async () => {
    const { control, world } = setup();
    world.sceneResult = { ok: false, reason: "la scène « Cuisine » n'existe pas dans OBS" };
    expect(await control.updateScene("Cuisine")).toEqual({
      ok: false,
      status: 409,
      message: "la scène « Cuisine » n'existe pas dans OBS",
    });
  });
});

describe("décaler la fin du live", () => {
  it("repousse la fin à la dizaine de minutes suivante avec « later », avec l'heure du serveur", () => {
    const { control, calls } = setup({ settings: { foxEndAt: toInstantText(START + 25 * 60_000) } });
    expect(control.updateEnd("later")).toEqual({ ok: true });
    expect(calls.ends).toEqual([START + 30 * 60_000]);
  });

  it("la ramène à la dizaine précédente avec « sooner »", () => {
    const { control, calls } = setup({ settings: { foxEndAt: toInstantText(START + 35 * 60_000) } });
    control.updateEnd("sooner");
    expect(calls.ends).toEqual([START + 30 * 60_000]);
  });

  it("sans fin prévue, « later » en pose une à la dizaine qui suit maintenant, « sooner » ne change rien", () => {
    const { control, calls } = setup();
    control.updateEnd("sooner");
    expect(calls.ends).toEqual([]);
    control.updateEnd("later");
    expect(calls.ends).toEqual([START + 10 * 60_000]);
  });

  it("retire la fin quand « sooner » la ramène à maintenant ou avant", () => {
    const { control, calls } = setup({ settings: { foxEndAt: toInstantText(START + 5 * 60_000) } });
    control.updateEnd("sooner");
    expect(calls.ends).toEqual([null]);
  });

  it("Si les réglages refusent la fin, alors le système doit le dire (422)", () => {
    const { control, world } = setup({ settings: { foxEndAt: toInstantText(START + 25 * 60_000) } });
    world.endResult = { ok: false, message: "valeurs non enregistrées : disque plein" };
    expect(control.updateEnd("later")).toEqual({
      ok: false,
      status: 422,
      message: "valeurs non enregistrées : disque plein",
    });
  });
});

describe("écrire dans le chat", () => {
  it("envoie le message tel quel au chat et rend sa réponse", async () => {
    const { control, calls, logs } = setup();
    expect(await control.sendMessage("Salut le chat")).toEqual({ ok: true });
    expect(calls.messages).toEqual(["Salut le chat"]);
    expect(logs).toContain("Régie : message envoyé au chat (13 caractères).");
  });

  it("Si Twitch refuse, alors le système doit rendre le refus, sans écrire le message dans le journal", async () => {
    const { control, world, logs } = setup();
    world.chatResult = { ok: false, status: 401, message: "Reconnecte Twitch" };
    expect(await control.sendMessage("Un secret")).toEqual({
      ok: false,
      status: 401,
      message: "Reconnecte Twitch",
    });
    expect(logs.join("\n")).not.toContain("Un secret");
    expect(logs).toContain("Régie : message refusé par Twitch (Reconnecte Twitch).");
  });
});

describe("les abonnés", () => {
  it("n'écrivent plus rien à celui qui se désabonne, et le serveur arrêté ne lit plus OBS", async () => {
    const { control, settle, updateObs, calls } = setup();
    const seen: string[] = [];
    const stop = control.subscribe((state) => seen.push(state.scene ?? "—"));
    control.start();
    await settle();
    stop();
    control.stop();
    await updateObs({ ...LINKED, scene: "Pause" });
    expect(seen).toEqual(["Jeu"]);
    expect(calls.pcNames).toHaveLength(1);
  });
});

describe("l'arrêt du live", () => {
  const goLive = async (setup_: ReturnType<typeof setup>) => {
    setup_.control.start();
    await setup_.settle();
    for (const listener of setup_.broadcastListeners) listener({ isLive: true, duration: 5000 });
  };

  it("Quand le live est en cours, le système doit demander à OBS de l'arrêter", async () => {
    const made = setup();
    await goLive(made);
    expect(await made.control.stopLive()).toEqual({ ok: true });
    expect(made.calls.stops).toBe(1);
    expect(made.logs).toContain("Régie : arrêt du live demandé à OBS.");
  });

  it("Si le live n'est pas en cours, alors le système doit refuser (409) sans rien demander à OBS : il ne démarre jamais le live", async () => {
    const made = setup();
    made.control.start();
    await made.settle();
    expect(await made.control.stopLive()).toEqual({
      ok: false,
      status: 409,
      message: "le live n'est pas en cours",
    });
    expect(made.calls.stops).toBe(0);
  });

  it("Si OBS n'est pas joint, alors le live est tenu pour arrêté et rien n'est demandé", async () => {
    const made = setup();
    await goLive(made);
    await made.updateObs(OBS_OFFLINE);
    expect((await made.control.stopLive()).ok).toBe(false);
    expect(made.calls.stops).toBe(0);
  });

  it("Si OBS refuse, alors le système doit rendre son refus (409) tel quel et le dire au journal", async () => {
    const made = setup();
    await goLive(made);
    made.world.stopResult = { ok: false, reason: "OBS refuse d'arrêter le live (output not active)" };
    expect(await made.control.stopLive()).toEqual({
      ok: false,
      status: 409,
      message: "OBS refuse d'arrêter le live (output not active)",
    });
    expect(made.logs.some((line) => line.startsWith("Régie : le live n'est pas arrêté"))).toBe(true);
  });

  it("repasse hors ligne dans l'état de la régie quand OBS dit que la diffusion est finie", async () => {
    const made = setup();
    await goLive(made);
    expect(made.control.getState().broadcast.isLive).toBe(true);
    for (const listener of made.broadcastListeners) listener({ isLive: false, duration: 0 });
    expect(made.control.getState().broadcast.isLive).toBe(false);
    expect((await made.control.stopLive()).ok).toBe(false);
  });
});

describe("la liste des viewers", () => {
  const chatViewer = (id: string, nickname: string) => ({ id, nickname });

  it("lit la liste chez Twitch à chaque demande, triée par pseudo sans tenir compte de la casse ni des accents", async () => {
    const made = setup();
    made.world.chatViewersResult = {
      ok: true,
      chatViewers: [
        chatViewer("3", "zoé"),
        chatViewer("1", "Élise"),
        chatViewer("2", "bob"),
        chatViewer("4", "Alice"),
      ],
    };
    const result = await made.control.listChatViewers();
    expect(result).toEqual({
      ok: true,
      chatViewers: [
        chatViewer("4", "Alice"),
        chatViewer("2", "bob"),
        chatViewer("1", "Élise"),
        chatViewer("3", "zoé"),
      ],
    });
    await made.control.listChatViewers();
    expect(made.calls.chatViewerReads).toBe(2);
  });

  it("rend une liste vide quand personne n'est connecté au chat", async () => {
    const made = setup();
    expect(await made.control.listChatViewers()).toEqual({ ok: true, chatViewers: [] });
  });

  it("Si Twitch refuse, alors le système doit rendre son refus tel quel (statut et phrase) et le dire au journal", async () => {
    const made = setup();
    made.world.chatViewersResult = {
      ok: false,
      status: 401,
      message: "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus",
    };
    expect(await made.control.listChatViewers()).toEqual(made.world.chatViewersResult);
    expect(made.logs.some((line) => line.startsWith("Régie : la liste du chat est illisible"))).toBe(true);
  });
});
