import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import type { PictureState } from "../../domain/picture.schema";
import { openPictureStream, PICTURE_KEEPALIVE_EVENT, PICTURE_KEEPALIVE_MS } from "./picture-stream";

const PC: PictureState = {
  members: [
    { id: "pc", label: "PC", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isAvailable: true },
    { id: "head", label: "Tête", isAvailable: true },
  ],
  currentId: "pc",
};
const CAMERA: PictureState = { ...PC, currentId: "camera-1" };

// La régie à la main : un état que le test change, et ceux qui l'écoutent.
const createFakeControl = () => {
  let state: ControlState = { ...IDLE_CONTROL, picture: PC };
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

const setup = () => {
  const fake = createFakeControl();
  const pictures: PictureState[] = [];
  const beats: unknown[] = [];
  const close = openPictureStream(
    { control: fake.control },
    (picture) => pictures.push(picture),
    (event, payload) => beats.push([event, payload]),
  );
  return { fake, pictures, beats, close };
};

describe("openPictureStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Quand une connexion s'ouvre, le système doit lui envoyer tout de suite l'image en cours", () => {
    const { pictures } = setup();
    expect(pictures).toEqual([PC]);
  });

  it("envoie l'image à chaque changement, d'où il vienne : le bandeau, un téléphone, OBS à la main, le repli", () => {
    const { fake, pictures } = setup();
    fake.publish({ ...IDLE_CONTROL, picture: CAMERA });
    fake.publish({ ...IDLE_CONTROL, picture: PC });
    expect(pictures.map(({ currentId }) => currentId)).toEqual(["pc", "camera-1", "pc"]);
  });

  it("envoie aussi un changement de disponibilité d'une caméra", () => {
    const { fake, pictures } = setup();
    const lost: PictureState = {
      ...PC,
      members: PC.members.map((member) =>
        member.id === "camera-1" ? { ...member, isAvailable: false } : member,
      ),
    };
    fake.publish({ ...IDLE_CONTROL, picture: lost });
    expect(pictures).toHaveLength(2);
    expect(pictures[1]?.members.find(({ id }) => id === "camera-1")?.isAvailable).toBe(false);
  });

  it("n'envoie rien quand la régie change sans que l'image change (les viewers, la scène)", () => {
    const { fake, pictures } = setup();
    fake.publish({ ...IDLE_CONTROL, picture: PC, scene: "Pause" });
    fake.publish({ ...IDLE_CONTROL, picture: PC, viewers: { kind: "live", count: 12 } });
    expect(pictures).toEqual([PC]);
  });

  it("envoie un message keepalive sans rien dedans toutes les 30 s, sous un nom : le plugin ne lit que les messages sans nom", async () => {
    const { beats } = setup();
    await vi.advanceTimersByTimeAsync(PICTURE_KEEPALIVE_MS - 1);
    expect(beats).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(PICTURE_KEEPALIVE_MS);
    expect(beats).toEqual([
      [PICTURE_KEEPALIVE_EVENT, null],
      [PICTURE_KEEPALIVE_EVENT, null],
    ]);
  });

  it("Quand la connexion se ferme, le système doit ne plus rien envoyer : ni changement ni keepalive", async () => {
    const { fake, pictures, beats, close } = setup();
    close();
    fake.publish({ ...IDLE_CONTROL, picture: CAMERA });
    await vi.advanceTimersByTimeAsync(PICTURE_KEEPALIVE_MS * 3);
    expect(pictures).toEqual([PC]);
    expect(beats).toEqual([]);
    expect(fake.listeners()).toBe(0);
  });

  it("sert chaque connexion pour elle seule : en fermer une laisse l'autre écouter", () => {
    const fake = createFakeControl();
    const first: PictureState[] = [];
    const second: PictureState[] = [];
    const closeFirst = openPictureStream(
      { control: fake.control },
      (picture) => first.push(picture),
      () => undefined,
    );
    openPictureStream(
      { control: fake.control },
      (picture) => second.push(picture),
      () => undefined,
    );
    closeFirst();
    fake.publish({ ...IDLE_CONTROL, picture: CAMERA });
    expect(first).toEqual([PC]);
    expect(second).toEqual([PC, CAMERA]);
  });
});
