import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SoundEvent } from "../../domain/sound.schema";
import { createSoundStore } from "../../infra/sound.repository";
import { createSoundLibrary, type RewardPort } from "../../usecase/sound.usecase";
import { createSoundQueue } from "../../usecase/sound-queue.usecase";

const ascii = (text: string): number[] => Array.from(text).map((character) => character.charCodeAt(0));
const wav = (marker: number): Uint8Array =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...new Array(40).fill(marker)]);

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// Un Twitch qui accepte tout : cette suite ne regarde que le disque et la queue (twitch-flow.test.ts joue le faux Twitch).
const createAcceptingRewards = (): RewardPort => {
  let rewards = 0;
  return {
    list: async () => ({ ok: true, value: [] }),
    create: async () => {
      rewards += 1;
      return { ok: true, value: `reward-${rewards}` };
    },
    update: async () => ({ ok: true, value: null }),
    delete: async () => ({ ok: true, value: null }),
    listPending: async () => ({ ok: true, value: [] }),
    settle: async () => ({ ok: true, value: null }),
  };
};

// Le serveur câblé comme runtime.ts le fait pour la soundboard (disque, bibliothèque, queue), dans un dossier jetable.
const startStack = (directory?: string) => {
  const root = directory ?? mkdtempSync(join(tmpdir(), "sound-flow-"));
  if (!directory) folders.push(root);
  const logs: string[] = [];
  const store = createSoundStore(join(root, "data", "sounds"), (line) => logs.push(line));
  const rewards = createAcceptingRewards();
  let ids = 0;
  const library = createSoundLibrary({
    store,
    rewards,
    createId: () => {
      ids += 1;
      return `sound00${ids}`;
    },
    log: (line) => logs.push(line),
  });
  let plays = 0;
  const queue = createSoundQueue({
    library,
    rewards,
    createId: () => {
      plays += 1;
      return `play${plays}`;
    },
    schedule: () => () => undefined,
    log: (line) => logs.push(line),
  });
  // La page /sounds : ce qu'elle reçoit s'empile, et elle va chercher le fichier de chaque son comme le navigateur le fera.
  const events: SoundEvent[] = [];
  const fetched: { soundId: string; firstByte: number | undefined }[] = [];
  queue.subscribe((event) => {
    events.push(event);
    if (event.kind === "play") {
      fetched.push({ soundId: event.soundId, firstByte: library.getAudio(event.soundId)?.bytes[12] });
    }
  });
  return { root, library, queue, events, fetched, logs };
};

describe("la soundboard, de bout en bout sur un vrai dossier", () => {
  it("ajoute deux sons, les joue l'un après l'autre à leur fader, puis les rejoue après un redémarrage du serveur", async () => {
    const first = startStack();
    const rire = await first.library.create({ title: "Rire", cost: 100, pace: 30, fader: 80, file: wav(7) });
    const bravo = await first.library.create({ title: "Bravo", cost: 250, pace: 0, fader: 35, file: wav(9) });
    expect(rire.ok && bravo.ok).toBe(true);

    expect(first.queue.play("sound001")).toEqual({ ok: true });
    expect(first.queue.play("sound002")).toEqual({ ok: true });
    expect(first.events).toHaveLength(1);
    first.queue.finish("play1", "ended");
    expect(
      first.events.map((event) => (event.kind === "play" ? `${event.soundId}@${event.fader}` : "stop")),
    ).toEqual(["sound001@80", "sound002@35"]);
    // Le fichier que la page va chercher est bien celui du son.
    expect(first.fetched).toEqual([
      { soundId: "sound001", firstByte: 7 },
      { soundId: "sound002", firstByte: 9 },
    ]);
    first.queue.finish("play2", "ended");
    expect(first.logs).toContain("Son « Bravo » : fini.");

    const second = startStack(first.root);
    expect(second.library.list().map(({ title }) => title)).toEqual(["Bravo", "Rire"]);
    expect(second.library.getAudio("sound001")?.mime).toBe("audio/wav");
  });

  it("coupe le son : la page reçoit l'ordre de se taire et la suite ne part pas", async () => {
    const stack = startStack();
    await stack.library.create({ title: "Rire", cost: 100, pace: 30, fader: 80, file: wav(7) });
    await stack.library.create({ title: "Bravo", cost: 100, pace: 30, fader: 80, file: wav(9) });
    stack.queue.play("sound001");
    stack.queue.play("sound002");
    stack.queue.stop();
    stack.queue.finish("play1", "ended");
    expect(stack.events.map(({ kind }) => kind)).toEqual(["play", "stop"]);
  });

  it("supprime un son : sa page ne le joue plus et son fichier a disparu", async () => {
    const stack = startStack();
    await stack.library.create({ title: "Rire", cost: 100, pace: 30, fader: 80, file: wav(7) });
    expect((await stack.library.delete("sound001")).ok).toBe(true);
    expect(stack.queue.play("sound001")).toEqual({ ok: false, status: 404, message: "son introuvable" });
    expect(stack.library.getAudio("sound001")).toBeUndefined();
  });
});
