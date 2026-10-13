import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type StoredEmotes, toEmptyLists } from "../domain/emote-sync.rules";
import { createEmoteStore } from "./emotes.repository";

const folders: string[] = [];
const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "emotes-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const stored: StoredEmotes = {
  savedAt: 1234,
  lists: { ...toEmptyLists(), "7tv": { global: ["EZ", "Clap"], channel: ["FenyHype"] } },
};

const FILE_LINES = [
  "savedAt: 1234",
  "7tv global: EZ Clap",
  "7tv channel: FenyHype",
  "bttv global:",
  "bttv channel:",
  "ffz global:",
  "ffz channel:",
  "",
];

describe("createEmoteStore : les dernières listes gardées dans data/", () => {
  it("rend rien quand le fichier n'existe pas encore, sans rien dire", () => {
    const logs: string[] = [];
    const store = createEmoteStore(join(createFolder(), "data", "emotes.txt"), (line) => logs.push(line));
    expect(store.get()).toBeUndefined();
    expect(logs).toEqual([]);
  });

  it("relit ce qu'il a écrit, et crée le dossier data/ au besoin", () => {
    const path = join(createFolder(), "data", "emotes.txt");
    const store = createEmoteStore(path, () => undefined);
    store.update(stored);
    expect(store.get()).toEqual(stored);
    expect(createEmoteStore(path, () => undefined).get()).toEqual(stored);
  });

  it("écrit une ligne par liste, en texte : Biome n'a rien à formater", () => {
    const path = join(createFolder(), "emotes.txt");
    createEmoteStore(path, () => undefined).update(stored);
    expect(readFileSync(path, "utf8")).toBe(FILE_LINES.join("\n"));
  });

  it("écrit le fichier en entier d'un coup : pas de fichier temporaire qui reste", () => {
    const path = join(createFolder(), "emotes.txt");
    createEmoteStore(path, () => undefined).update(stored);
    expect(readFileSync(path, "utf8")).toContain("7tv global: EZ Clap");
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
  });

  it("remplace l'ancien contenu à chaque écriture", () => {
    const path = join(createFolder(), "emotes.txt");
    const store = createEmoteStore(path, () => undefined);
    store.update(stored);
    store.update({ savedAt: 9999, lists: toEmptyLists() });
    expect(store.get()?.savedAt).toBe(9999);
    expect(store.get()?.lists["7tv"].global).toEqual([]);
  });

  it("ignore un fichier qui n'est pas ce que le serveur écrit, et le dit avec son chemin", () => {
    const path = join(createFolder(), "emotes.txt");
    writeFileSync(path, "pas une liste");
    const logs: string[] = [];
    expect(createEmoteStore(path, (line) => logs.push(line)).get()).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Emotes :");
    expect(logs[0]).toContain(path);
  });

  it("ignore un fichier auquel il manque une liste", () => {
    const path = join(createFolder(), "emotes.txt");
    writeFileSync(path, "savedAt: 1\n7tv global: EZ\n");
    const logs: string[] = [];
    expect(createEmoteStore(path, (line) => logs.push(line)).get()).toBeUndefined();
    expect(logs).toHaveLength(1);
  });

  it("lit un fichier écrit avec un BOM et des fins de ligne Windows", () => {
    const path = join(createFolder(), "emotes.txt");
    writeFileSync(path, String.fromCharCode(0xfeff) + FILE_LINES.join("\r\n"));
    expect(createEmoteStore(path, () => undefined).get()).toEqual(stored);
  });
});
