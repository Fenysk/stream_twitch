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
import type { SoundFile } from "../domain/sound.schema";
import { createSoundStore } from "./sound.repository";

const sound: SoundFile = {
  title: "Applaudissements",
  cost: 100,
  pace: 30,
  fader: 80,
  format: "wav",
  rewardId: "reward-1",
  isManaged: true,
};
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

  it("garde l'identifiant du reward avec le son, et lit `null` dans un sound.json d'avant les récompenses", () => {
    const { store, directory } = setup();
    expect(store.create("abcd0001", sound, wavBytes).rewardId).toBe("reward-1");
    mkdirSync(join(directory, "abcd0002"), { recursive: true });
    writeFileSync(join(directory, "abcd0002", "audio.wav"), wavBytes);
    writeFileSync(
      join(directory, "abcd0002", "sound.json"),
      '{ "title": "Ancien", "cost": 100, "pace": 30, "fader": 80, "format": "wav" }',
    );
    expect(store.get("abcd0002")?.rewardId).toBeNull();
  });

  it("tient pour géré un son d'avant `isManaged` (l'app avait créé son reward), et garde un son relié à un reward qu'elle ne gère pas", () => {
    const { store, directory } = setup();
    mkdirSync(join(directory, "abcd0002"), { recursive: true });
    writeFileSync(join(directory, "abcd0002", "audio.wav"), wavBytes);
    writeFileSync(
      join(directory, "abcd0002", "sound.json"),
      '{ "title": "Ancien", "cost": 100, "pace": 30, "fader": 80, "format": "wav", "rewardId": "reward-9" }',
    );
    expect(store.get("abcd0002")?.isManaged).toBe(true);
    const linked = store.create(
      "abcd0003",
      { ...sound, title: "Clash", rewardId: "reward-2", isManaged: false },
      wavBytes,
    );
    expect(linked.isManaged).toBe(false);
    expect(store.get("abcd0003")?.isManaged).toBe(false);
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

  it("garde un son dont le fichier audio manque (son reward existe chez Twitch), sans rien à jouer", () => {
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
