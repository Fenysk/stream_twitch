import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ObsIdsFile } from "../domain/obs-ids.schema";
import { createObsIdsStore } from "./obs-ids.repository";

const folders: string[] = [];
const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "obs-ids-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const file: ObsIdsFile = {
  ids: {
    micName: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Micro PC" },
    cameraSlotScene: { configuredName: "Master - Webcam", uuid: "s-webcam", name: "Master - Webcam" },
  },
};

describe("createObsIdsStore : data/obs-ids.json", () => {
  it("rend rien quand le fichier n'existe pas encore, sans rien dire", () => {
    const logs: string[] = [];
    const store = createObsIdsStore(join(createFolder(), "data", "obs-ids.json"), (line) => logs.push(line));
    expect(store.get()).toBeUndefined();
    expect(logs).toEqual([]);
  });

  it("relit ce qu'il a écrit, et crée le dossier data/ au besoin", () => {
    const path = join(createFolder(), "data", "obs-ids.json");
    createObsIdsStore(path, () => undefined).update(file);
    expect(createObsIdsStore(path, () => undefined).get()).toEqual(file);
  });

  it("écrit le fichier d'un coup : pas de fichier temporaire qui reste", () => {
    const path = join(createFolder(), "obs-ids.json");
    createObsIdsStore(path, () => undefined).update(file);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(file);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("met de côté un fichier qui n'est pas du JSON, le dit, et ne l'écrase pas", () => {
    const path = join(createFolder(), "obs-ids.json");
    writeFileSync(path, "{ pas du json");
    const logs: string[] = [];
    expect(createObsIdsStore(path, (line) => logs.push(line)).get()).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(`${path}.invalid`);
    expect(readFileSync(`${path}.invalid`, "utf8")).toBe("{ pas du json");
  });

  it("met de côté un fichier d'un réglage inconnu ou d'une source sans identifiant, en disant où", () => {
    const path = join(createFolder(), "obs-ids.json");
    writeFileSync(
      path,
      JSON.stringify({ ids: { micName: { configuredName: "Mic/Aux", name: "Micro PC" } } }),
    );
    const logs: string[] = [];
    expect(createObsIdsStore(path, (line) => logs.push(line)).get()).toBeUndefined();
    expect(logs[0]).toContain("ids.micName");
    expect(existsSync(`${path}.invalid`)).toBe(true);
  });
});
