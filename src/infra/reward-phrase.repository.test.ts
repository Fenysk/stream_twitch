import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RewardPhrasesFile } from "../domain/reward-phrase.schema";
import { createRewardPhraseStore } from "./reward-phrase.repository";

const folders: string[] = [];
const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "reward-phrases-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const file: RewardPhrasesFile = {
  "reward-drink": { title: "À boire !", phrases: ["Bois un coup de la part de {user} !"] },
  "reward-stretch": { title: "Étirement !", phrases: ["Étire-toi, {user}.", "Debout, {user} !"] },
};

describe("createRewardPhraseStore : data/reward-phrases.json", () => {
  it("rend un fichier vide quand il n'existe pas encore, sans rien dire", () => {
    const logs: string[] = [];
    const store = createRewardPhraseStore(join(createFolder(), "data", "reward-phrases.json"), (line) =>
      logs.push(line),
    );
    expect(store.get()).toEqual({});
    expect(logs).toEqual([]);
  });

  it("relit ce qu'il a écrit après un redémarrage, et crée le dossier data/ au besoin", () => {
    const path = join(createFolder(), "data", "reward-phrases.json");
    createRewardPhraseStore(path, () => undefined).update(file);
    expect(createRewardPhraseStore(path, () => undefined).get()).toEqual(file);
  });

  it("écrit le fichier d'un coup : pas de fichier temporaire qui reste", () => {
    const path = join(createFolder(), "reward-phrases.json");
    createRewardPhraseStore(path, () => undefined).update(file);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(file);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("relit un fichier écrit par un éditeur Windows, BOM en tête", () => {
    const path = join(createFolder(), "reward-phrases.json");
    writeFileSync(path, `﻿${JSON.stringify(file)}`);
    expect(createRewardPhraseStore(path, () => undefined).get()).toEqual(file);
  });

  it("met de côté un fichier qui n'est pas du JSON, le dit, et ne l'écrase pas", () => {
    const path = join(createFolder(), "reward-phrases.json");
    writeFileSync(path, "{ pas du json");
    const logs: string[] = [];
    expect(createRewardPhraseStore(path, (line) => logs.push(line)).get()).toEqual({});
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(`${path}.invalid`);
    expect(readFileSync(`${path}.invalid`, "utf8")).toBe("{ pas du json");
    expect(existsSync(path)).toBe(false);
  });

  it("met de côté un fichier qui n'a pas le bon format, en disant ce qui manque", () => {
    const path = join(createFolder(), "reward-phrases.json");
    writeFileSync(path, JSON.stringify({ "reward-drink": { title: "À boire !", phrases: [] } }));
    const logs: string[] = [];
    expect(createRewardPhraseStore(path, (line) => logs.push(line)).get()).toEqual({});
    expect(logs[0]).toContain("reward-drink");
    expect(existsSync(`${path}.invalid`)).toBe(true);
  });
});
