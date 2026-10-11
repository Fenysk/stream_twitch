import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSettings } from "./settings.repository";

const folders: string[] = [];

const writeSettings = (content: unknown): string => {
  const folder = mkdtempSync(join(tmpdir(), "settings-"));
  folders.push(folder);
  const path = join(folder, "settings.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const valid = { obsAddress: "ws://127.0.0.1:4455", micName: "Mic/Aux", threshold: -40, delay: 250 };

describe("getSettings", () => {
  it("lit le settings.json livré à la racine du dépôt", () => {
    expect(getSettings("settings.json")).toMatchObject({ obsAddress: "ws://127.0.0.1:4455" });
  });

  it("garde rhythm et opening quand ils sont présents, et les laisse absents sinon", () => {
    expect(getSettings(writeSettings(valid))).toEqual(valid);
    expect(getSettings(writeSettings({ ...valid, rhythm: 90, opening: 1.5 }))).toEqual({
      ...valid,
      rhythm: 90,
      opening: 1.5,
    });
  });

  it("garde tilt quand il est présent, permet 0 et refuse le négatif", () => {
    expect(getSettings(writeSettings({ ...valid, tilt: 1, opening: 1.8 }))).toEqual({
      ...valid,
      tilt: 1,
      opening: 1.8,
    });
    expect(getSettings(writeSettings({ ...valid, tilt: 0 })).tilt).toBe(0);
    expect(() => getSettings(writeSettings({ ...valid, tilt: -1 }))).toThrow(/tilt/);
  });

  it("garde les trois réglages du scale quand ils sont tous là", () => {
    const scale = { quietScale: 0.5, loudScale: 1.5, loudLevel: -10 };
    expect(getSettings(writeSettings({ ...valid, ...scale }))).toEqual({ ...valid, ...scale });
  });

  it("garde quietLevel avec les trois réglages du scale, et le refuse sans eux", () => {
    const scale = { quietScale: 0.5, loudScale: 1.5, loudLevel: -10, quietLevel: -25 };
    expect(getSettings(writeSettings({ ...valid, ...scale }))).toEqual({ ...valid, ...scale });
    expect(() => getSettings(writeSettings({ ...valid, quietLevel: -25 }))).toThrow(
      /quietScale, loudScale et loudLevel/,
    );
  });

  it("veut un loudLevel au-dessus du quietLevel, ou du threshold quand il n'y a pas de quietLevel", () => {
    const scale = { quietScale: 0.5, loudScale: 1.5 };
    expect(() => getSettings(writeSettings({ ...valid, ...scale, quietLevel: -25, loudLevel: -30 }))).toThrow(
      /loudLevel/,
    );
    expect(() => getSettings(writeSettings({ ...valid, ...scale, quietLevel: -25, loudLevel: -25 }))).toThrow(
      /loudLevel/,
    );
    expect(getSettings(writeSettings({ ...valid, ...scale, loudLevel: -30 })).loudLevel).toBe(-30);
  });

  it("refuse un réglage du scale sans les deux autres", () => {
    expect(() => getSettings(writeSettings({ ...valid, loudScale: 1.5 }))).toThrow(
      /quietScale, loudScale et loudLevel/,
    );
    expect(() => getSettings(writeSettings({ ...valid, quietScale: 0.5, loudLevel: -10 }))).toThrow(
      /quietScale, loudScale et loudLevel/,
    );
  });

  it("refuse un loudLevel qui ne dépasse pas le threshold, ou un scale nul", () => {
    const scale = { quietScale: 0.5, loudScale: 1.5 };
    expect(() => getSettings(writeSettings({ ...valid, ...scale, loudLevel: -40 }))).toThrow(/loudLevel/);
    expect(() => getSettings(writeSettings({ ...valid, ...scale, loudLevel: -60 }))).toThrow(/loudLevel/);
    expect(() => getSettings(writeSettings({ ...valid, ...scale, loudLevel: 5 }))).toThrow(/loudLevel/);
    expect(() =>
      getSettings(writeSettings({ ...valid, quietScale: 0, loudScale: 1.5, loudLevel: -10 })),
    ).toThrow(/quietScale/);
  });

  it("garde les quatre réglages du repos quand ils sont tous là", () => {
    const idle = { idleMin: 2000, idleMax: 5000, idleAngle: 2, idleLift: 0.005 };
    expect(getSettings(writeSettings({ ...valid, ...idle }))).toEqual({ ...valid, ...idle });
  });

  it("refuse un réglage du repos sans les trois autres", () => {
    expect(() => getSettings(writeSettings({ ...valid, idleMin: 2000 }))).toThrow(
      /idleMin, idleMax, idleAngle et idleLift/,
    );
    expect(() =>
      getSettings(writeSettings({ ...valid, idleMin: 2000, idleMax: 5000, idleAngle: 2 })),
    ).toThrow(/idleMin, idleMax, idleAngle et idleLift/);
  });

  it("refuse un idleMax plus petit que idleMin, ou un réglage du repos nul ou négatif", () => {
    const idle = { idleMin: 2000, idleMax: 5000, idleAngle: 2, idleLift: 0.005 };
    expect(() => getSettings(writeSettings({ ...valid, ...idle, idleMax: 1000 }))).toThrow(/idleMax/);
    expect(getSettings(writeSettings({ ...valid, ...idle, idleMax: 2000 })).idleMax).toBe(2000);
    expect(() => getSettings(writeSettings({ ...valid, ...idle, idleMin: 0 }))).toThrow(/idleMin/);
    expect(() => getSettings(writeSettings({ ...valid, ...idle, idleAngle: -1 }))).toThrow(/idleAngle/);
    expect(() => getSettings(writeSettings({ ...valid, ...idle, idleLift: 0 }))).toThrow(/idleLift/);
  });

  it("refuse une clé inconnue : une faute de frappe ne doit pas être ignorée", () => {
    expect(() => getSettings(writeSettings({ ...valid, treshold: -30 }))).toThrow(/settings\.json invalide/);
  });

  it("nomme le champ fautif quand une valeur est hors limites", () => {
    expect(() => getSettings(writeSettings({ ...valid, threshold: 5 }))).toThrow(/threshold/);
    expect(() => getSettings(writeSettings({ ...valid, obsAddress: "127.0.0.1:4455" }))).toThrow(
      /obsAddress/,
    );
  });

  it("nomme le fichier quand il est absent ou n'est pas du JSON", () => {
    expect(() => getSettings(join(tmpdir(), "absent-settings.json"))).toThrow(
      "absent-settings.json est introuvable",
    );
    expect(() => getSettings(writeSettings("{ pas du json"))).toThrow("n'est pas du JSON valide");
  });
});
