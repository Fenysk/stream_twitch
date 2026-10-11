import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteLocalSettings, getLocalSettings, updateLocalSettings } from "./local-settings.repository";

const folders: string[] = [];

const createPath = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "local-settings-"));
  folders.push(folder);
  return join(folder, "settings.local.json");
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("getLocalSettings", () => {
  it("rend un objet vide quand le fichier n'existe pas, sans rien dire", () => {
    const messages: string[] = [];
    expect(getLocalSettings(createPath(), (message) => messages.push(message))).toEqual({});
    expect(messages).toEqual([]);
  });

  it("lit les valeurs d'Alexis", () => {
    const path = createPath();
    writeFileSync(path, JSON.stringify({ threshold: -35, tilt: 0.5 }));
    expect(getLocalSettings(path, () => undefined)).toEqual({ threshold: -35, tilt: 0.5 });
  });

  it("ignore un fichier qui n'est pas du JSON, et le dit avec son nom", () => {
    const path = createPath();
    writeFileSync(path, "{ pas du json");
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({});
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("settings.local.json ignoré");
    expect(messages[0]).toContain("n'est pas du JSON valide");
  });

  it("ignore un fichier qui ne suit pas le format, en nommant le réglage fautif", () => {
    const path = createPath();
    writeFileSync(path, JSON.stringify({ threshold: "fort", obsAddress: "ws://autre:4455" }));
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({});
    expect(messages.join(" ")).toContain("threshold");
    expect(messages.join(" ")).toContain("obsAddress");
  });
});

describe("getLocalSettings : les clés qui ne sont pas des réglages de l'interface", () => {
  it("garde les cinq réglages de l'interface et ignore les autres, en les nommant dans une seule ligne du journal", () => {
    const path = createPath();
    writeFileSync(
      path,
      JSON.stringify({
        tilt: 0.5,
        opening: 2,
        quietScale: 0.3,
        loudScale: 2,
        loudLevel: 0,
        micName: "Mic/Aux",
      }),
    );
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({ tilt: 0.5, opening: 2 });
    expect(messages).toHaveLength(1);
    for (const key of ["quietScale", "loudScale", "loudLevel", "micName", "settings.json"]) {
      expect(messages[0]).toContain(key);
    }
  });

  it("ne dit rien quand il n'y a que des réglages de l'interface", () => {
    const path = createPath();
    writeFileSync(
      path,
      JSON.stringify({ threshold: -35, tilt: 0.5, opening: 2, voiceEffect: 1, idleAngle: 6 }),
    );
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({
      threshold: -35,
      tilt: 0.5,
      opening: 2,
      voiceEffect: 1,
      idleAngle: 6,
    });
    expect(messages).toEqual([]);
  });

  it("ignore un fichier qui n'est pas un objet", () => {
    const path = createPath();
    writeFileSync(path, "[1, 2]");
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({});
    expect(messages).toHaveLength(1);
  });
});

describe("getLocalSettings : un fichier enregistré avec un BOM", () => {
  it("le lit comme un autre : Notepad écrit ce BOM en tête du fichier", () => {
    const path = createPath();
    writeFileSync(path, `\uFEFF${JSON.stringify({ tilt: 0.5, opening: 2 })}`);
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual({ tilt: 0.5, opening: 2 });
    expect(messages).toEqual([]);
  });
});

describe("updateLocalSettings", () => {
  it("écrit le fichier, que getLocalSettings relit", () => {
    const path = createPath();
    updateLocalSettings(path, { threshold: -35, idleAngle: 3 });
    expect(getLocalSettings(path, () => undefined)).toEqual({ threshold: -35, idleAngle: 3 });
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("écrit d'abord un fichier temporaire puis le renomme : il n'en reste aucun, et l'ancien contenu est remplacé", () => {
    const path = createPath();
    updateLocalSettings(path, { threshold: -35 });
    updateLocalSettings(path, { opening: 2 });
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ opening: 2 });
  });
});

describe("deleteLocalSettings", () => {
  it("supprime le fichier", () => {
    const path = createPath();
    updateLocalSettings(path, { threshold: -35 });
    deleteLocalSettings(path);
    expect(existsSync(path)).toBe(false);
  });

  it("ne dit rien quand il n'y a pas de fichier", () => {
    expect(() => deleteLocalSettings(createPath())).not.toThrow();
  });
});
