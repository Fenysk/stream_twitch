import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RewardRecordsFile } from "../domain/reward.schema";
import type { SoundFile } from "../domain/sound.schema";
import type { RewardRecordStore } from "../usecase/reward.usecase";
import { createSoundStore, upgradeSounds } from "./sound.repository";

const sound: SoundFile = { title: "Applaudissements", fader: 80, format: "wav" };
const wavBytes = Uint8Array.from([1, 2, 3, 4]);

const folders: string[] = [];

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "sounds-"));
  folders.push(root);
  const directory = join(root, "data", "sounds");
  const messages: string[] = [];
  return { directory, messages, store: createSoundStore(directory, (message) => messages.push(message)) };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("createSoundStore : écrire et relire", () => {
  it("écrit sound.json et le fichier audio dans data/sounds/<id>/", () => {
    const { store, directory } = setup();
    const stored = store.create("abcd0001", sound, wavBytes);
    expect(stored).toMatchObject({ id: "abcd0001", ...sound });
    expect(readdirSync(join(directory, "abcd0001")).sort()).toEqual(["audio.wav", "sound.json"]);
    expect(Array.from(readFileSync(join(directory, "abcd0001", "audio.wav")))).toEqual([1, 2, 3, 4]);
    expect(JSON.parse(readFileSync(join(directory, "abcd0001", "sound.json"), "utf8"))).toEqual(sound);
  });

  it("relit les réglages et donne le fichier", () => {
    const { store } = setup();
    store.create("abcd0001", sound, wavBytes);
    expect(store.get("abcd0001")).toMatchObject(sound);
    expect(Array.from(store.getFile("abcd0001") ?? [])).toEqual([1, 2, 3, 4]);
    expect(store.get("abcd0002")).toBeUndefined();
    expect(store.getFile("abcd0002")).toBeUndefined();
  });

  it("ne garde dans sound.json que le titre, le fader et le format : ni coût, ni pace, ni reward", () => {
    const { store, directory } = setup();
    const stored = store.create("abcd0001", sound, wavBytes);
    expect(Object.keys(stored).sort()).toEqual(["fader", "format", "id", "title", "version"]);
    expect(Object.keys(JSON.parse(readFileSync(join(directory, "abcd0001", "sound.json"), "utf8")))).toEqual([
      "title",
      "fader",
      "format",
    ]);
  });

  it("relit un sound.json d'avant sans rien garder de son reward : il se lit comme un sound seul", () => {
    const { store, directory } = setup();
    mkdirSync(join(directory, "abcd0002"), { recursive: true });
    writeFileSync(join(directory, "abcd0002", "audio.wav"), wavBytes);
    writeFileSync(
      join(directory, "abcd0002", "sound.json"),
      '{ "title": "Ancien", "cost": 100, "pace": 30, "fader": 80, "format": "wav", "rewardId": "reward-9", "isManaged": false }',
    );
    const stored = store.get("abcd0002");
    expect(stored).toMatchObject({ id: "abcd0002", title: "Ancien", fader: 80, format: "wav" });
    expect(stored).not.toHaveProperty("rewardId");
    expect(stored).not.toHaveProperty("isManaged");
    expect(stored).not.toHaveProperty("cost");
  });

  it("ne laisse aucun fichier temporaire derrière lui", () => {
    const { store, directory } = setup();
    store.create("abcd0001", sound, wavBytes);
    expect(readdirSync(join(directory, "abcd0001")).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("liste tous les sons, et rien quand le dossier n'existe pas encore", () => {
    const { store } = setup();
    expect(store.list()).toEqual([]);
    store.create("abcd0001", sound, wavBytes);
    store.create("abcd0002", { ...sound, title: "Rire" }, wavBytes);
    expect(
      store
        .list()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["abcd0001", "abcd0002"]);
  });
});

describe("createSoundStore : modifier", () => {
  it("garde l'ancien fichier quand il n'en vient pas de nouveau, et change la version", async () => {
    const { store } = setup();
    const created = store.create("abcd0001", sound, wavBytes);
    await sleep(20);
    const updated = store.update("abcd0001", { ...sound, fader: 20 }, undefined);
    expect(updated.fader).toBe(20);
    expect(Array.from(store.getFile("abcd0001") ?? [])).toEqual([1, 2, 3, 4]);
    expect(updated.version).not.toBe(created.version);
  });

  it("remplace le fichier, et retire l'ancien quand le format change", () => {
    const { store, directory } = setup();
    store.create("abcd0001", sound, wavBytes);
    const updated = store.update("abcd0001", { ...sound, format: "ogg" }, Uint8Array.from([9, 9]));
    expect(updated.format).toBe("ogg");
    expect(readdirSync(join(directory, "abcd0001")).sort()).toEqual(["audio.ogg", "sound.json"]);
    expect(Array.from(store.getFile("abcd0001") ?? [])).toEqual([9, 9]);
  });
});

describe("createSoundStore : supprimer", () => {
  it("retire tout le dossier du son, et ne dit rien d'un son absent", () => {
    const { store, directory } = setup();
    store.create("abcd0001", sound, wavBytes);
    store.delete("abcd0001");
    expect(existsSync(join(directory, "abcd0001"))).toBe(false);
    expect(() => store.delete("abcd0001")).not.toThrow();
  });
});

describe("createSoundStore : ce qui est cassé ou dangereux", () => {
  it("refuse un identifiant qui ressemble à un chemin", () => {
    const { store } = setup();
    expect(store.get("../../x")).toBeUndefined();
    expect(store.getFile("../../x")).toBeUndefined();
    expect(() => store.delete("../../x")).toThrow("identifiant de son invalide");
    expect(() => store.create("../../x", sound, wavBytes)).toThrow("identifiant de son invalide");
  });

  it("ignore un son dont sound.json est invalide, et le dit", () => {
    const { store, directory, messages } = setup();
    mkdirSync(join(directory, "abcd0001"), { recursive: true });
    writeFileSync(join(directory, "abcd0001", "sound.json"), '{ "title": "" }');
    expect(store.list()).toEqual([]);
    expect(messages[0]).toContain("Son abcd0001 ignoré : sound.json invalide");
  });

  it("garde un son dont le fichier audio manque, de quoi le supprimer, sans rien à jouer", () => {
    const { store, directory, messages } = setup();
    store.create("abcd0001", sound, wavBytes);
    rmSync(join(directory, "abcd0001", "audio.wav"));
    expect(store.get("abcd0001")).toMatchObject({ id: "abcd0001", title: "Applaudissements" });
    expect(store.list()).toHaveLength(1);
    expect(store.getFile("abcd0001")).toBeUndefined();
    expect(messages).toEqual([]);
  });

  it("ignore un dossier qui n'est pas un identifiant, et un sound.json illisible", () => {
    const { store, directory, messages } = setup();
    mkdirSync(join(directory, "pas-un-id"), { recursive: true });
    mkdirSync(join(directory, "abcd0001"), { recursive: true });
    writeFileSync(join(directory, "abcd0001", "sound.json"), "pas du json");
    expect(store.list()).toEqual([]);
    expect(messages[0]).toContain("Son abcd0001 ignoré");
  });
});

// Un faux data/rewards.json en mémoire : ce qu'on y a écrit, et un disque qui peut tomber en panne.
const createFakeRewards = (initial: RewardRecordsFile = {}) => {
  const state = { file: initial, writes: 0, failure: undefined as Error | undefined };
  const store: RewardRecordStore = {
    get: () => state.file,
    update(next) {
      if (state.failure) throw state.failure;
      state.writes += 1;
      state.file = next;
    },
  };
  return { store, state };
};

// Les deux sound.json réels d'avant, écrits tels quels dans data/sounds/.
const SITCOM_JSON =
  '{ "title": "Rires de sitcom", "cost": 100, "pace": 30, "fader": 80, "format": "mp3", "rewardId": null, "isManaged": false }';
const PROUT_JSON =
  '{ "title": "Prout.", "cost": 50, "pace": 10, "fader": 80, "format": "mp3", "rewardId": "bf38114f-2b75-4538-b5b5-a071db82f77e", "isManaged": false }';
const PROUT_REWARD = "bf38114f-2b75-4538-b5b5-a071db82f77e";

const writeSound = (directory: string, id: string, json: string) => {
  mkdirSync(join(directory, id), { recursive: true });
  writeFileSync(join(directory, id, "audio.mp3"), wavBytes);
  writeFileSync(join(directory, id, "sound.json"), json);
};

const getSoundJson = (directory: string, id: string): unknown =>
  JSON.parse(readFileSync(join(directory, id, "sound.json"), "utf8"));

describe("upgradeSounds : la conversion au démarrage", () => {
  it("relie « Prout. » à son reward dans rewards.json et réécrit les deux sound.json avec le titre, le fader et le format", () => {
    const { directory } = setup();
    const rewards = createFakeRewards();
    writeSound(directory, "48ae9a52", SITCOM_JSON);
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, () => undefined);
    expect(rewards.state.file).toEqual({
      [PROUT_REWARD]: { title: "Prout.", sound: "823e2671", isManaged: false },
    });
    expect(getSoundJson(directory, "48ae9a52")).toEqual({
      title: "Rires de sitcom",
      fader: 80,
      format: "mp3",
    });
    expect(getSoundJson(directory, "823e2671")).toEqual({ title: "Prout.", fader: 80, format: "mp3" });
    expect(existsSync(join(directory, "823e2671", "audio.mp3"))).toBe(true);
  });

  it("le dit dans le journal : combien de sound.json convertis, combien de rewards reliés", () => {
    const { directory } = setup();
    const messages: string[] = [];
    writeSound(directory, "48ae9a52", SITCOM_JSON);
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, createFakeRewards().store, (message) => messages.push(message));
    expect(messages).toEqual([
      "Sons : 2 sound.json converti(s) (titre, fader, format) ; 1 récompense(s) reliée(s) dans data/rewards.json.",
    ]);
  });

  it("se rejoue sans rien changer : un sound.json converti n'est plus touché, ni rewards.json", () => {
    const { directory } = setup();
    const rewards = createFakeRewards();
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, () => undefined);
    const messages: string[] = [];
    upgradeSounds(directory, rewards.store, (message) => messages.push(message));
    expect(messages).toEqual([]);
    expect(rewards.state.writes).toBe(1);
    expect(getSoundJson(directory, "823e2671")).toEqual({ title: "Prout.", fader: 80, format: "mp3" });
  });

  it("reprend après un arrêt entre rewards.json et sound.json : rewards.json n'est pas réécrit, sound.json l'est", () => {
    const { directory } = setup();
    const rewards = createFakeRewards({
      [PROUT_REWARD]: { title: "Prout.", sound: "823e2671", isManaged: false },
    });
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, () => undefined);
    expect(rewards.state.writes).toBe(0);
    expect(getSoundJson(directory, "823e2671")).toEqual({ title: "Prout.", fader: 80, format: "mp3" });
  });

  it("garde l'enregistrement qui existe déjà pour ce reward", () => {
    const { directory } = setup();
    const kept = { title: "Prout. (Twitch)", sound: "autre001", isManaged: false };
    const rewards = createFakeRewards({ [PROUT_REWARD]: kept });
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, () => undefined);
    expect(rewards.state.file[PROUT_REWARD]).toEqual(kept);
  });

  it("ne touche à aucun sound.json si rewards.json ne s'écrit pas, et le dit : le prochain démarrage recommence", () => {
    const { directory } = setup();
    const messages: string[] = [];
    const rewards = createFakeRewards();
    rewards.state.failure = new Error("disque plein");
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, (message) => messages.push(message));
    expect(readFileSync(join(directory, "823e2671", "sound.json"), "utf8")).toBe(PROUT_JSON);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("disque plein");
  });

  it("ne dit rien et n'écrit rien quand il n'y a pas de dossier de sounds, ou rien à convertir", () => {
    const { directory } = setup();
    const messages: string[] = [];
    const rewards = createFakeRewards();
    upgradeSounds(directory, rewards.store, (message) => messages.push(message));
    writeSound(directory, "abcd0001", '{ "title": "Neuf", "fader": 80, "format": "mp3" }');
    upgradeSounds(directory, rewards.store, (message) => messages.push(message));
    expect(messages).toEqual([]);
    expect(rewards.state.writes).toBe(0);
  });

  it("saute un sound.json illisible en le disant, et convertit les autres", () => {
    const { directory } = setup();
    const messages: string[] = [];
    const rewards = createFakeRewards();
    writeSound(directory, "abcd0001", "pas du json");
    writeSound(directory, "823e2671", PROUT_JSON);
    upgradeSounds(directory, rewards.store, (message) => messages.push(message));
    expect(messages[0]).toContain("Son abcd0001 : conversion sautée");
    expect(Object.keys(rewards.state.file)).toEqual([PROUT_REWARD]);
  });
});
