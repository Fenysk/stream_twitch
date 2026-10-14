import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RegularsFile } from "../domain/regulars.schema";
import { createRegularsStore } from "./regulars.repository";

const folders: string[] = [];
const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "regulars-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const file: RegularsFile = {
  createdAt: 1000,
  viewers: { alice: { firstSeen: 1000, lastSeen: 5000, lives: 3 } },
};

describe("createRegularsStore : data/viewers.json", () => {
  it("rend rien quand le fichier n'existe pas encore, sans rien dire", () => {
    const logs: string[] = [];
    const store = createRegularsStore(join(createFolder(), "data", "viewers.json"), (line) =>
      logs.push(line),
    );
    expect(store.get()).toBeUndefined();
    expect(logs).toEqual([]);
  });

  it("relit ce qu'il a écrit, et crée le dossier data/ au besoin", () => {
    const path = join(createFolder(), "data", "viewers.json");
    createRegularsStore(path, () => undefined).update(file);
    expect(createRegularsStore(path, () => undefined).get()).toEqual(file);
  });

  it("écrit le fichier d'un coup : pas de fichier temporaire qui reste", () => {
    const path = join(createFolder(), "viewers.json");
    createRegularsStore(path, () => undefined).update(file);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(file);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("relit un fichier écrit par un éditeur Windows, BOM en tête", () => {
    const path = join(createFolder(), "viewers.json");
    writeFileSync(path, `﻿${JSON.stringify(file)}`);
    expect(createRegularsStore(path, () => undefined).get()).toEqual(file);
  });

  it("met de côté un fichier qui n'est pas du JSON, le dit, et ne l'écrase pas", () => {
    const path = join(createFolder(), "viewers.json");
    writeFileSync(path, "{ pas du json");
    const logs: string[] = [];
    const store = createRegularsStore(path, (line) => logs.push(line));
    expect(store.get()).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(`${path}.invalid`);
    expect(readFileSync(`${path}.invalid`, "utf8")).toBe("{ pas du json");
    expect(existsSync(path)).toBe(false);
  });

  it("met de côté un fichier qui n'a pas le bon format, en disant ce qui manque", () => {
    const path = join(createFolder(), "viewers.json");
    writeFileSync(path, JSON.stringify({ createdAt: 1000, viewers: { alice: { lives: 0 } } }));
    const logs: string[] = [];
    expect(createRegularsStore(path, (line) => logs.push(line)).get()).toBeUndefined();
    expect(logs[0]).toContain("viewers.alice");
    expect(existsSync(`${path}.invalid`)).toBe(true);
  });
});
