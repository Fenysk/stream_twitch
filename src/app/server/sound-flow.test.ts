import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RewardChoice, RewardEvent, RewardStatus } from "../../domain/reward.types";
import type { SoundEvent } from "../../domain/sound.schema";
import { createRewardStore } from "../../infra/reward.repository";
import { createSoundStore, upgradeSounds } from "../../infra/sound.repository";
import { createRewardLibrary, type RewardPort } from "../../usecase/reward.usecase";
import { createSoundLibrary } from "../../usecase/sound.usecase";
import { createSoundQueue } from "../../usecase/sound-queue.usecase";

const ascii = (text: string): number[] => Array.from(text).map((character) => character.charCodeAt(0));
const wav = (marker: number): Uint8Array =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...new Array(40).fill(marker)]);

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// Un Twitch qui accepte tout : cette suite ne regarde que le disque et la queue (twitch-flow.test.ts joue le faux Twitch). Il liste
// les rewards qu'on lui donne, et note chaque écriture (`writes`) et chaque statut posé sur un rachat (`settled`).
const createAcceptingRewards = (remote: RewardChoice[] = []) => {
  const writes: string[] = [];
  const settled: string[] = [];
  let rewards = 0;
  const twitch: RewardPort = {
    list: async () => ({ ok: true, value: remote }),
    create: async () => {
      rewards += 1;
      writes.push("create");
      return { ok: true, value: `reward-${rewards}` };
    },
    update: async () => {
      writes.push("update");
      return { ok: true, value: null };
    },
    delete: async () => {
      writes.push("delete");
      return { ok: true, value: null };
    },
    listPending: async () => ({ ok: true, value: [] }),
    settle: async ({ id }, status: RewardStatus) => {
      settled.push(`${id}:${status}`);
      return { ok: true, value: null };
    },
  };
  return { twitch, writes, settled };
};

const remoteReward = (id: string, title: string, isManageable: boolean): RewardChoice => ({
  id,
  title,
  cost: 100,
  pace: 30,
  isManageable,
});

// Le serveur câblé comme runtime.ts le fait pour la soundboard (conversion, disque, bibliothèques, queue), dans un dossier jetable.
const startStack = (directory?: string, remote: RewardChoice[] = []) => {
  const root = directory ?? mkdtempSync(join(tmpdir(), "sound-flow-"));
  if (!directory) folders.push(root);
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);
  const soundsFolder = join(root, "data", "sounds");
  const rewardStore = createRewardStore(join(root, "data", "rewards.json"), log);
  upgradeSounds(soundsFolder, rewardStore, log);
  const store = createSoundStore(soundsFolder, log);
  const twitch = createAcceptingRewards(remote);
  let ids = 0;
  const sounds = createSoundLibrary({
    store,
    createId: () => {
      ids += 1;
      return `sound00${ids}`;
    },
    usage: { listRewardTitles: (id) => rewards.listTitlesOf(id), listClipCounts: () => new Map() },
    onDelete: async (id) => {
      await queue.forget(id);
      rewards.detachSound(id);
    },
    log,
  });
  const rewards = createRewardLibrary({
    store: rewardStore,
    twitch: twitch.twitch,
    sounds,
    onDelete: (rewardId) => queue.forgetReward(rewardId),
    log,
  });
  let plays = 0;
  const queue = createSoundQueue({
    library: sounds,
    records: rewards,
    rewards: twitch.twitch,
    createId: () => {
      plays += 1;
      return `play${plays}`;
    },
    schedule: () => () => undefined,
    log,
  });
  // La page /sounds : ce qu'elle reçoit s'empile, et elle va chercher le fichier de chaque son comme le navigateur le fera.
  const events: SoundEvent[] = [];
  const fetched: { soundId: string; firstByte: number | undefined }[] = [];
  queue.subscribe((event) => {
    events.push(event);
    if (event.kind === "play") {
      fetched.push({ soundId: event.soundId, firstByte: sounds.getAudio(event.soundId)?.bytes[12] });
    }
  });
  const getRewardsFile = (): unknown => JSON.parse(readFileSync(join(root, "data", "rewards.json"), "utf8"));
  return { root, sounds, rewards, queue, events, fetched, logs, twitch, getRewardsFile };
};

const redeem = (rewardId: string, id: string): RewardEvent => ({
  kind: "reward",
  id,
  rewardId,
  title: rewardId,
  user: "Alice",
});

describe("la soundboard, de bout en bout sur un vrai dossier", () => {
  it("ajoute deux sons, les joue l'un après l'autre à leur fader, puis les rejoue après un redémarrage du serveur", () => {
    const first = startStack();
    const rire = first.sounds.create({ title: "Rire", fader: 80, file: wav(7) });
    const bravo = first.sounds.create({ title: "Bravo", fader: 35, file: wav(9) });
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
    expect(second.sounds.list().map(({ title }) => title)).toEqual(["Bravo", "Rire"]);
    expect(second.sounds.getAudio("sound001")?.mime).toBe("audio/wav");
  });

  it("coupe le son : la page reçoit l'ordre de se taire et la suite ne part pas", () => {
    const stack = startStack();
    stack.sounds.create({ title: "Rire", fader: 80, file: wav(7) });
    stack.sounds.create({ title: "Bravo", fader: 80, file: wav(9) });
    stack.queue.play("sound001");
    stack.queue.play("sound002");
    stack.queue.stop();
    stack.queue.finish("play1", "ended");
    expect(stack.events.map(({ kind }) => kind)).toEqual(["play", "stop"]);
  });

  it("supprime un son : sa page ne le joue plus et son fichier a disparu, sans écrire sur Twitch", async () => {
    const stack = startStack();
    stack.sounds.create({ title: "Rire", fader: 80, file: wav(7) });
    expect((await stack.sounds.delete("sound001")).ok).toBe(true);
    expect(stack.queue.play("sound001")).toEqual({ ok: false, status: 404, message: "son introuvable" });
    expect(stack.sounds.getAudio("sound001")).toBeUndefined();
    expect(stack.twitch.writes).toEqual([]);
  });
});

// Les deux sound.json réels d'avant la séparation des sounds et des rewards.
const SITCOM_JSON =
  '{ "title": "Rires de sitcom", "cost": 100, "pace": 30, "fader": 80, "format": "mp3", "rewardId": null, "isManaged": false }';
const PROUT_JSON =
  '{ "title": "Prout.", "cost": 50, "pace": 10, "fader": 80, "format": "mp3", "rewardId": "bf38114f-2b75-4538-b5b5-a071db82f77e", "isManaged": false }';

const writeLegacySound = (root: string, id: string, json: string, marker: number) => {
  const folder = join(root, "data", "sounds", id);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "audio.wav"), wav(marker));
  writeFileSync(join(folder, "sound.json"), json);
};

describe("la conversion des sound.json d'avant, au démarrage du serveur", () => {
  it("garde « Prout. » relié à son reward et fait de « Rires de sitcom » un sound seul", () => {
    const root = mkdtempSync(join(tmpdir(), "sound-flow-"));
    folders.push(root);
    writeLegacySound(root, "48ae9a52", SITCOM_JSON, 1);
    writeLegacySound(root, "823e2671", PROUT_JSON, 2);
    const stack = startStack(root);
    expect(stack.sounds.list()).toEqual([
      {
        id: "823e2671",
        title: "Prout.",
        fader: 80,
        version: expect.any(String),
        rewardTitles: ["Prout."],
        clipCount: 0,
      },
      {
        id: "48ae9a52",
        title: "Rires de sitcom",
        fader: 80,
        version: expect.any(String),
        rewardTitles: [],
        clipCount: 0,
      },
    ]);
    expect(stack.getRewardsFile()).toEqual({
      "bf38114f-2b75-4538-b5b5-a071db82f77e": { title: "Prout.", sound: "823e2671", isManaged: false },
    });
    expect(JSON.parse(readFileSync(join(root, "data", "sounds", "823e2671", "sound.json"), "utf8"))).toEqual({
      title: "Prout.",
      fader: 80,
      format: "mp3",
    });
    expect(stack.logs).toContain(
      "Sons : 2 sound.json converti(s) (titre, fader, format) ; 1 récompense(s) reliée(s) dans data/rewards.json.",
    );
  });

  it("joue le sound de « Prout. » au rachat de son reward, sans statut puisque l'app ne le gère pas, après la conversion", async () => {
    const root = mkdtempSync(join(tmpdir(), "sound-flow-"));
    folders.push(root);
    writeLegacySound(root, "823e2671", PROUT_JSON.replace('"format": "mp3"', '"format": "wav"'), 5);
    const stack = startStack(root);
    expect(stack.queue.redeem(redeem("bf38114f-2b75-4538-b5b5-a071db82f77e", "red-1"))).toBe(true);
    expect(stack.events).toEqual([
      { kind: "play", playId: "play1", soundId: "823e2671", version: expect.any(String), fader: 80 },
    ]);
    stack.queue.finish("play1", "ended");
    await Promise.resolve();
    expect(stack.twitch.settled).toEqual([]);
  });

  it("se rejoue au redémarrage sans rien changer : le même rewards.json, les mêmes sound.json", () => {
    const root = mkdtempSync(join(tmpdir(), "sound-flow-"));
    folders.push(root);
    writeLegacySound(root, "823e2671", PROUT_JSON, 2);
    const first = startStack(root);
    const converted = first.getRewardsFile();
    const second = startStack(root);
    expect(second.getRewardsFile()).toEqual(converted);
    expect(second.logs.filter((line) => line.startsWith("Sons : "))).toEqual([]);
    expect(second.sounds.list()).toMatchObject([{ id: "823e2671", rewardTitles: ["Prout."] }]);
  });
});

describe("un sound partagé par deux rewards, sur un vrai dossier", () => {
  it("se joue pour chacun des deux, et le supprimer les laisse sans sound sans toucher à Twitch", async () => {
    const remote = [remoteReward("fait-main", "Prout.", false), remoteReward("mien", "Rire", true)];
    const stack = startStack(undefined, remote);
    stack.sounds.create({ title: "Prout", fader: 80, file: wav(3) });
    expect(await stack.rewards.updateSound("fait-main", "sound001")).toEqual({ ok: true, value: "sound001" });
    expect(await stack.rewards.updateSound("mien", "sound001")).toEqual({ ok: true, value: "sound001" });
    expect(stack.sounds.list()[0]?.rewardTitles).toEqual(["Prout.", "Rire"]);

    expect(stack.queue.redeem(redeem("fait-main", "red-1"))).toBe(true);
    expect(stack.queue.redeem(redeem("mien", "red-2"))).toBe(true);
    stack.queue.finish("play1", "ended");
    stack.queue.finish("play2", "ended");
    await Promise.resolve();
    expect(stack.events.filter(({ kind }) => kind === "play")).toHaveLength(2);
    expect(stack.twitch.settled).toEqual(["red-2:FULFILLED"]);

    expect((await stack.sounds.delete("sound001")).ok).toBe(true);
    expect(stack.getRewardsFile()).toEqual({ mien: { title: "Rire", sound: null, isManaged: true } });
    expect(stack.twitch.writes).toEqual([]);
  });
});
