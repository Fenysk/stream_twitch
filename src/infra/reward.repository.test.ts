import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RewardRecordsFile } from "../domain/reward.schema";
import { createRewardStore } from "./reward.repository";

const folders: string[] = [];
const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "rewards-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const file: RewardRecordsFile = {
  "bf38114f-2b75-4538-b5b5-a071db82f77e": { title: "Prout.", sound: "823e2671", isManaged: false },
  "reward-1": { title: "Rire", sound: null, isManaged: true },
};

describe("createRewardStore : data/rewards.json", () => {
  it("rend un fichier vide quand il n'existe pas encore, sans rien dire", () => {
    const logs: string[] = [];
    const store = createRewardStore(join(createFolder(), "data", "rewards.json"), (line) => logs.push(line));
    expect(store.get()).toEqual({});
    expect(logs).toEqual([]);
  });

  it("relit ce qu'il a écrit après un redémarrage, et crée le dossier data/ au besoin", () => {
    const path = join(createFolder(), "data", "rewards.json");
    createRewardStore(path, () => undefined).update(file);
    expect(createRewardStore(path, () => undefined).get()).toEqual(file);
  });

  it("écrit le fichier d'un coup : pas de fichier temporaire qui reste", () => {
    const path = join(createFolder(), "rewards.json");
    createRewardStore(path, () => undefined).update(file);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(file);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("met de côté un fichier qui n'est pas du JSON, le dit avec son nom, et ne l'écrase pas", () => {
    const path = join(createFolder(), "rewards.json");
    writeFileSync(path, "{ pas du json");
    const logs: string[] = [];
    expect(createRewardStore(path, (line) => logs.push(line)).get()).toEqual({});
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Récompenses : ");
    expect(logs[0]).toContain(`${path}.invalid`);
    expect(readFileSync(`${path}.invalid`, "utf8")).toBe("{ pas du json");
    expect(existsSync(path)).toBe(false);
  });

  it("met de côté un fichier qui n'a pas le bon format, en disant ce qui manque", () => {
    const path = join(createFolder(), "rewards.json");
    writeFileSync(path, JSON.stringify({ "reward-1": { title: "Rire", isManaged: true } }));
    const logs: string[] = [];
    expect(createRewardStore(path, (line) => logs.push(line)).get()).toEqual({});
    expect(logs[0]).toContain("reward-1.sound");
    expect(existsSync(`${path}.invalid`)).toBe(true);
  });
});
