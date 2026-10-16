import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toEffectiveSettings } from "../domain/settings.rules";
import {
  deleteLocalSettings,
  getLocalSettings,
  updateLocalSettings,
  upgradeLocalSettings,
} from "./local-settings.repository";
import { getSettings } from "./settings.repository";

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

describe("upgradeLocalSettings : la fin prévue encore écrite « HH:MM » (foxEndTime)", () => {
  const at = (hours: number, minutes = 0): number => new Date(2026, 9, 16, hours, minutes).getTime();
  const iso = (when: number): string => new Date(when).toISOString();
  // Le settings.local.json d'Alexis avant foxEndAt : ses réglages, et « 15:00 ».
  const kept = {
    threshold: -40,
    tilt: 1,
    expression: "fdef51f3",
    foxLargeChance: 0.6,
    foxEmoteReactions: ["LUL = sourire", "Kappa = clin"],
  };
  const legacy = { ...kept, foxEndTime: "15:00" };

  const upgraded = (content: unknown, now: number) => {
    const path = createPath();
    writeFileSync(path, JSON.stringify(content));
    const messages: string[] = [];
    upgradeLocalSettings(path, now, (message) => messages.push(message));
    return { path, messages, json: JSON.parse(readFileSync(path, "utf8")) as unknown };
  };

  it("la remplace par foxEndAt dans le fichier : « 15:00 » à 14 h est celle d'aujourd'hui", () => {
    expect(upgraded(legacy, at(14)).json).toEqual({ ...kept, foxEndAt: iso(at(15)) });
  });

  it("garde celle d'aujourd'hui, dépassée, à 16 h : elle a sonné il y a moins de 3 h", () => {
    expect(upgraded(legacy, at(16)).json).toEqual({ ...kept, foxEndAt: iso(at(15)) });
  });

  it("prend celle de demain à 19 h : elle a sonné il y a plus de 3 h", () => {
    expect(upgraded(legacy, at(19)).json).toEqual({
      ...kept,
      foxEndAt: iso(new Date(2026, 9, 17, 15).getTime()),
    });
  });

  it("laisse le serveur démarrer avec ce fichier : il est lu en entier, et ses réglages valent avec ceux de settings.json", () => {
    const { path } = upgraded(legacy, at(14));
    const messages: string[] = [];
    const local = getLocalSettings(path, (message) => messages.push(message));
    expect(messages).toEqual([]);
    expect(local).toEqual({ ...kept, foxEndAt: iso(at(15)) });
    const effective = toEffectiveSettings(getSettings("settings.json"), local);
    expect(effective.ok).toBe(true);
    expect(effective.ok && effective.value.foxEndAt).toBe(iso(at(15)));
  });

  it("n'est pas lu comme un réglage inconnu avant la conversion : le fichier d'avant perdrait sa fin", () => {
    const path = createPath();
    writeFileSync(path, JSON.stringify(legacy));
    const messages: string[] = [];
    expect(getLocalSettings(path, (message) => messages.push(message))).toEqual(kept);
    expect(messages.join(" ")).toContain("foxEndTime");
  });

  it("dit la conversion dans le journal, une ligne", () => {
    const { messages } = upgraded(legacy, at(14));
    expect(messages).toEqual([`settings.local.json : foxEndTime « 15:00 » devient foxEndAt ${iso(at(15))}.`]);
  });

  it("ne change rien à un fichier converti : relancé plus tard, il garde le même instant", () => {
    const first = upgraded(legacy, at(14));
    const messages: string[] = [];
    upgradeLocalSettings(first.path, at(19), (message) => messages.push(message));
    expect(JSON.parse(readFileSync(first.path, "utf8"))).toEqual({ ...kept, foxEndAt: iso(at(15)) });
    expect(messages).toEqual([]);
  });

  it("retire un foxEndTime vide ou qui n'est pas une heure, sans fin prévue", () => {
    for (const foxEndTime of ["", "minuit", "24:00"]) {
      const { json, messages } = upgraded({ ...kept, foxEndTime }, at(14));
      expect(json, foxEndTime).toEqual(kept);
      expect(messages[0], foxEndTime).toContain("aucune fin prévue à convertir");
    }
  });

  it("garde le foxEndAt déjà écrit quand les deux y sont, et retire foxEndTime", () => {
    const { json } = upgraded({ ...legacy, foxEndAt: iso(at(22)) }, at(14));
    expect(json).toEqual({ ...kept, foxEndAt: iso(at(22)) });
  });

  it("ne touche pas un fichier qui n'a pas foxEndTime, ni ne dit rien", () => {
    const { json, messages } = upgraded(kept, at(14));
    expect(json).toEqual(kept);
    expect(messages).toEqual([]);
  });

  it("ne fait rien sans fichier, et laisse un fichier abîmé à getLocalSettings", () => {
    const messages: string[] = [];
    upgradeLocalSettings(createPath(), at(14), (message) => messages.push(message));
    expect(messages).toEqual([]);
    const path = createPath();
    writeFileSync(path, "{ pas du json");
    upgradeLocalSettings(path, at(14), (message) => messages.push(message));
    expect(readFileSync(path, "utf8")).toBe("{ pas du json");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("n'a pas pu être converti");
  });

  it("ne laisse aucun fichier temporaire", () => {
    const { path } = upgraded(legacy, at(14));
    expect(existsSync(`${path}.tmp`)).toBe(false);
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
