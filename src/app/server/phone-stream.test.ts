import { afterEach, describe, expect, it, vi } from "vitest";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import {
  PHONE_KEEPALIVE_EVENT,
  PHONE_KEEPALIVE_MS,
  type PhoneEvent,
  type PhoneRole,
} from "../../domain/phone.schema";
import { createControl, OBS_OFFLINE, type ObsControlState } from "../../usecase/control.usecase";
import { createPhones } from "../../usecase/phone.usecase";
import { openPhoneStream } from "./phone-stream";

// La régie à la main : un état que le test change, et ceux qui l'écoutent.
const createFakeControl = () => {
  let state: ControlState = IDLE_CONTROL;
  const listeners = new Set<(next: ControlState) => void>();
  return {
    control: {
      getState: () => state,
      subscribe(listener: (next: ControlState) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    publish(next: ControlState) {
      state = next;
      for (const listener of listeners) listener(next);
    },
    listeners: () => listeners.size,
  };
};

const describeEvent = (event: PhoneEvent): string => {
  if (event.kind === "control") return `control ${event.state.scene}`;
  if (event.kind === "air") return `air ${event.isOnAir}`;
  if (event.kind === "mic") return `mic ${event.isLive}`;
  return event.kind;
};

const setup = (role: PhoneRole) => {
  const phones = createPhones({ log: () => undefined });
  const fake = createFakeControl();
  const received: string[] = [];
  const events: PhoneEvent[] = [];
  const named: string[] = [];
  const close = openPhoneStream(
    { phones, control: fake.control },
    { id: "phone-0001", role },
    (event: PhoneEvent) => {
      events.push(event);
      received.push(describeEvent(event));
    },
    (event) => named.push(event),
  );
  return { phones, fake, received, events, named, close };
};

describe("openPhoneStream", () => {
  it("Quand un téléphone Régie se connecte, le système doit lui envoyer son numéro, puis l'état de la régie sous le nom control", () => {
    const { received } = setup("control");
    expect(received).toEqual(["number", "control null"]);
  });

  it("lui envoie ensuite chaque changement de la régie, dans l'ordre", () => {
    const { received, fake } = setup("control");
    fake.publish({ ...IDLE_CONTROL, scene: "Jeu" });
    fake.publish({ ...IDLE_CONTROL, scene: "Pause" });
    expect(received).toEqual(["number", "control null", "control Jeu", "control Pause"]);
  });

  it("donne aussi la régie au Selfie, qui la montre dans un tiroir", () => {
    expect(setup("selfie").received).toEqual([
      "number",
      "air false",
      "mic false",
      "picture",
      "screen",
      "control null",
    ]);
  });

  it("n'envoie rien de la régie à un téléphone Caméra : seulement si sa caméra est à l'antenne et si son mic est celui du live", () => {
    const { received, fake } = setup("camera");
    fake.publish({ ...IDLE_CONTROL, scene: "Jeu" });
    expect(received).toEqual(["number", "air false", "mic false", "picture", "screen"]);
  });

  it("dit au téléphone qui filme quand sa caméra entre à l'antenne et quand elle en sort, sans répéter ce qu'il sait déjà", () => {
    const { received, fake } = setup("camera");
    fake.publish({ ...IDLE_CONTROL, scene: "Jeu", onAir: [2] });
    fake.publish({ ...IDLE_CONTROL, scene: "Pause", onAir: [1, 2] });
    fake.publish({ ...IDLE_CONTROL, scene: "Fin", onAir: [1] });
    fake.publish({ ...IDLE_CONTROL, scene: "Fin", onAir: [] });
    expect(received).toEqual([
      "number",
      "air false",
      "mic false",
      "picture",
      "screen",
      "air true",
      "air false",
    ]);
  });

  it("dit au téléphone qui filme quand son mic devient celui du live et quand il ne l'est plus, sans répéter ce qu'il sait déjà", () => {
    const { received, fake } = setup("camera");
    const mics = (open: string) =>
      ["pc", "camera-1", "camera-2"].map((id) => ({ id, label: id, isOpen: id === open, isAvailable: true }));
    fake.publish({ ...IDLE_CONTROL, mics: mics("pc") });
    fake.publish({ ...IDLE_CONTROL, mics: mics("camera-1") });
    fake.publish({ ...IDLE_CONTROL, scene: "Pause", mics: mics("camera-1") });
    fake.publish({ ...IDLE_CONTROL, mics: mics("camera-2") });
    fake.publish({ ...IDLE_CONTROL, mics: mics("pc") });
    expect(received.filter((line) => line.startsWith("mic"))).toEqual(["mic false", "mic true", "mic false"]);
  });

  it("suit une coupure faite à la main dans OBS : le mic de la caméra rouvert devient celui du live, coupé il ne l'est plus", () => {
    const { received, fake } = setup("selfie");
    const camera = (isOpen: boolean) => [
      { id: "pc", label: "pc", isOpen: !isOpen, isAvailable: true },
      { id: "camera-1", label: "camera-1", isOpen, isAvailable: true },
    ];
    fake.publish({ ...IDLE_CONTROL, mics: camera(true) });
    fake.publish({ ...IDLE_CONTROL, mics: camera(false) });
    expect(received.filter((line) => line.startsWith("mic"))).toEqual(["mic false", "mic true", "mic false"]);
  });

  it("dit tout de suite à un téléphone qui se connecte si son mic est déjà celui du live", () => {
    const phones = createPhones({ log: () => undefined });
    const fake = createFakeControl();
    fake.publish({
      ...IDLE_CONTROL,
      mics: [{ id: "camera-1", label: "Caméra 1", isOpen: true, isAvailable: true }],
    });
    const received: string[] = [];
    openPhoneStream(
      { phones, control: fake.control },
      { id: "phone-0001", role: "camera" },
      (event) => received.push(describeEvent(event)),
      () => undefined,
    );
    expect(received.slice(0, 3)).toEqual(["number", "air false", "mic true"]);
  });

  it("n'envoie jamais `mic` à la régie, qui n'a pas de caméra", () => {
    const { received, fake } = setup("control");
    fake.publish({
      ...IDLE_CONTROL,
      mics: [{ id: "camera-1", label: "Caméra 1", isOpen: true, isAvailable: true }],
    });
    expect(received.some((line) => line.startsWith("mic"))).toBe(false);
  });

  it("suit le numéro du téléphone pour son mic : le mic de la caméra 2 est celui du live, pas celui de la 1", () => {
    const { received, fake, phones } = setup("camera");
    fake.publish({
      ...IDLE_CONTROL,
      mics: [
        { id: "camera-1", label: "Caméra 1", isOpen: false, isAvailable: true },
        { id: "camera-2", label: "Caméra 2", isOpen: true, isAvailable: true },
      ],
    });
    expect(phones.updateNumber("phone-0001", 2)).toMatchObject({ ok: true });
    expect(phones.updateNumber("phone-0001", 1)).toMatchObject({ ok: true });
    expect(received.filter((line) => line.startsWith("mic"))).toEqual(["mic false", "mic true", "mic false"]);
  });

  it("dit tout de suite à un téléphone qui se connecte si sa caméra est déjà à l'antenne", () => {
    const phones = createPhones({ log: () => undefined });
    const fake = createFakeControl();
    fake.publish({ ...IDLE_CONTROL, onAir: [1] });
    const received: string[] = [];
    openPhoneStream(
      { phones, control: fake.control },
      { id: "phone-0001", role: "selfie" },
      (event) => received.push(describeEvent(event)),
      () => undefined,
    );
    expect(received.slice(0, 2)).toEqual(["number", "air true"]);
  });

  it("dit au téléphone qui filme où en est l'image pour lui : s'il y est, et qui y est, sans répéter ce qu'il sait déjà", () => {
    const { events, fake } = setup("camera");
    const picture = (currentId: string | null) => ({
      members: [
        { id: "pc", label: "PC", isAvailable: true },
        { id: "camera-1", label: "Caméra 1", isAvailable: true },
        { id: "head", label: "Tête", isAvailable: true },
      ],
      currentId,
    });
    fake.publish({ ...IDLE_CONTROL, picture: picture("pc") });
    fake.publish({ ...IDLE_CONTROL, scene: "Pause", picture: picture("pc") });
    fake.publish({ ...IDLE_CONTROL, picture: picture("camera-1") });
    fake.publish({ ...IDLE_CONTROL, picture: picture("head") });
    fake.publish({ ...IDLE_CONTROL, picture: picture(null) });
    const standings = events.flatMap((event) => (event.kind === "picture" ? [event.standing] : []));
    expect(standings).toEqual([
      { hasPlace: false, isCurrent: false, shown: null },
      { hasPlace: true, isCurrent: false, shown: "PC" },
      { hasPlace: true, isCurrent: true, shown: "Caméra 1" },
      { hasPlace: true, isCurrent: false, shown: "Tête" },
      { hasPlace: true, isCurrent: false, shown: null },
    ]);
  });

  it("suit le numéro du téléphone pour l'image : la caméra 2 est à l'image, pas la 1", () => {
    const { events, fake, phones } = setup("selfie");
    fake.publish({
      ...IDLE_CONTROL,
      picture: {
        members: [
          { id: "camera-1", label: "Caméra 1", isAvailable: true },
          { id: "camera-2", label: "Caméra 2", isAvailable: true },
        ],
        currentId: "camera-2",
      },
    });
    expect(phones.updateNumber("phone-0001", 2)).toMatchObject({ ok: true });
    expect(phones.updateNumber("phone-0001", 1)).toMatchObject({ ok: true });
    const isCurrent = events.flatMap((event) =>
      event.kind === "picture" ? [String(event.standing.isCurrent)] : [],
    );
    // Avant l'image d'OBS, avec elle pour le numéro 1, puis pour le 2, puis de nouveau pour le 1.
    expect(isCurrent).toEqual(["false", "false", "true", "false"]);
  });

  it("n'envoie jamais `picture` à la régie, qui n'a pas de caméra", () => {
    const { received, fake } = setup("control");
    fake.publish({
      ...IDLE_CONTROL,
      picture: { members: [{ id: "pc", label: "PC", isAvailable: true }], currentId: "pc" },
    });
    expect(received.some((line) => line.startsWith("picture"))).toBe(false);
  });

  it("n'envoie jamais `air` à la régie, qui n'a pas de caméra", () => {
    const { received, fake } = setup("control");
    fake.publish({ ...IDLE_CONTROL, onAir: [1] });
    expect(received.some((line) => line.startsWith("air"))).toBe(false);
  });

  it("suit le numéro du téléphone quand il en change : la caméra 2 est à l'antenne, pas la 1", () => {
    const { received, fake, phones } = setup("camera");
    fake.publish({ ...IDLE_CONTROL, onAir: [2] });
    expect(phones.updateNumber("phone-0001", 2)).toMatchObject({ ok: true });
    expect(phones.updateNumber("phone-0001", 1)).toMatchObject({ ok: true });
    expect(received.filter((line) => line.startsWith("air"))).toEqual(["air false", "air true", "air false"]);
  });

  it("Quand le flux d'une caméra se ferme, le système doit aussi ne plus écouter la régie", () => {
    const { fake, close } = setup("camera");
    expect(fake.listeners()).toBe(1);
    close();
    expect(fake.listeners()).toBe(0);
  });

  it("Quand le flux se ferme, le système doit retirer le téléphone et ne plus écouter la régie", () => {
    const { received, fake, phones, close } = setup("control");
    expect(phones.getState()).toHaveLength(1);
    close();
    fake.publish({ ...IDLE_CONTROL, scene: "Jeu" });
    expect(phones.getState()).toEqual([]);
    expect(fake.listeners()).toBe(0);
    expect(received).toEqual(["number", "control null"]);
  });
});

describe("la régie réelle et les téléphones qui filment", () => {
  // OBS à la main : l'état qu'il rend change, et la régie le relit quand on la prévient.
  const setupReal = () => {
    const obs = {
      state: { ...OBS_OFFLINE, isLinked: true, scene: "Jeu", scenes: ["Jeu"] } as ObsControlState,
    };
    const obsListeners = new Set<() => void>();
    const noop = () => () => undefined;
    const phones = createPhones({ log: () => undefined });
    const control = createControl({
      obs: {
        subscribe(listener) {
          obsListeners.add(listener);
          return () => {
            obsListeners.delete(listener);
          };
        },
        getState: async () => obs.state,
        updateProgramScene: async () => ({ ok: true }),
        updateInputMute: async () => ({ ok: true }),
        stopStream: async () => ({ ok: true }),
        updatePicture: async () => ({ ok: true }),
      },
      broadcast: { subscribe: noop },
      viewers: { getState: () => ({ kind: "unknown" }), subscribe: noop },
      phones,
      chat: { send: async () => ({ ok: true }) },
      chatViewers: { list: async () => ({ ok: true, chatViewers: [] }) },
      end: { update: () => ({ ok: true }) },
      settings: { micName: "Mic/Aux", foxEndAt: "" },
      listen: () => undefined,
      clock: () => 0,
      schedule: () => () => undefined,
      log: () => undefined,
    });
    const received: string[] = [];
    const change = async (onAir: number[]) => {
      obs.state = { ...obs.state, onAir };
      for (const listener of obsListeners) listener();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { phones, control, received, change };
  };

  it("Quand OBS montre la source de la caméra dans la scène du programme, le système doit le dire au téléphone, puis le retirer quand elle se cache", async () => {
    const { phones, control, received, change } = setupReal();
    control.start();
    await change([]);
    openPhoneStream(
      { phones, control },
      { id: "phone-0001", role: "camera" },
      (event) => received.push(describeEvent(event)),
      () => undefined,
    );
    await change([1]);
    await change([1, 2]);
    await change([2]);
    expect(received.filter((line) => line.startsWith("air"))).toEqual(["air false", "air true", "air false"]);
  });

  it("ne dit à l'antenne que la caméra du bon numéro : le Selfie 2 ne l'est pas quand seule la caméra 1 l'est", async () => {
    const { phones, control, received, change } = setupReal();
    control.start();
    openPhoneStream(
      { phones, control },
      { id: "phone-0001", role: "camera" },
      () => undefined,
      () => undefined,
    );
    openPhoneStream(
      { phones, control },
      { id: "phone-0002", role: "selfie" },
      (event) => received.push(describeEvent(event)),
      () => undefined,
    );
    await change([1]);
    expect(received.filter((line) => line.startsWith("air"))).toEqual(["air false"]);
    await change([1, 2]);
    expect(received.filter((line) => line.startsWith("air"))).toEqual(["air false", "air true"]);
  });
});

describe("le battement du flux d'un téléphone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Quand le flux d'un téléphone est ouvert, le système doit y envoyer un évènement nommé keepalive toutes les 5 s, sans rien dire de plus", () => {
    vi.useFakeTimers();
    const { named, received } = setup("control");
    expect(PHONE_KEEPALIVE_EVENT).toBe("keepalive");
    expect(PHONE_KEEPALIVE_MS).toBe(5000);
    expect(named).toEqual([]);
    vi.advanceTimersByTime(PHONE_KEEPALIVE_MS - 1);
    expect(named).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(named).toEqual(["keepalive"]);
    vi.advanceTimersByTime(PHONE_KEEPALIVE_MS * 2);
    expect(named).toEqual(["keepalive", "keepalive", "keepalive"]);
    expect(received).toEqual(["number", "control null"]);
  });

  it("bat aussi pour la Caméra et le Selfie : tous les rôles voient un flux muet", () => {
    vi.useFakeTimers();
    for (const role of ["camera", "selfie"] satisfies PhoneRole[]) {
      const { named } = setup(role);
      vi.advanceTimersByTime(PHONE_KEEPALIVE_MS);
      expect(named).toEqual(["keepalive"]);
    }
  });

  it("bat même quand la régie ne dit rien, et ne passe pas par les messages sans nom", () => {
    vi.useFakeTimers();
    const { named, events } = setup("control");
    vi.advanceTimersByTime(PHONE_KEEPALIVE_MS * 3);
    expect(named).toHaveLength(3);
    expect(events).toHaveLength(2);
  });

  it("Quand le flux se ferme, le système doit cesser de battre", () => {
    vi.useFakeTimers();
    const { named, close } = setup("control");
    vi.advanceTimersByTime(PHONE_KEEPALIVE_MS);
    close();
    vi.advanceTimersByTime(PHONE_KEEPALIVE_MS * 4);
    expect(named).toEqual(["keepalive"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
