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
import type { HeadFile } from "../domain/head.schema";
import { createExpressionStore } from "./expression.repository";

const geometry: HeadFile = {
  format: "tete-south-park/2",
  nom: "Méfiant",
  image: { largeur: 332, hauteur: 476 },
  coupe: { gauche: { x: 60, y: 300 }, droite: { x: 270, y: 301 } },
  fermeture: 14,
  animation: {
    rythmeMs: 110,
    amplitude: 1.3,
    probabiliteFermee: 0.22,
    poses: [
      { pivot: "droite", angle: 7 },
      { pivot: "gauche", angle: -7 },
    ],
  },
};

const images = {
  source: new Uint8Array([1, 2, 3]),
  top: new Uint8Array([4, 5, 6]),
  bottom: new Uint8Array([7, 8, 9]),
};

const folders: string[] = [];

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "expressions-"));
  folders.push(root);
  const directory = join(root, "data", "heads");
  const messages: string[] = [];
  return {
    directory,
    messages,
    store: createExpressionStore(directory, (message) => messages.push(message)),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("createExpressionStore : écrire et relire", () => {
  it("écrit la géométrie, l'image d'origine et les deux moitiés dans data/heads/<id>/", () => {
    const { store, directory } = setup();
    const stored = store.create("abcd0001", geometry, images);
    expect(stored).toMatchObject({ id: "abcd0001", name: "Méfiant", geometry });
    expect(readdirSync(join(directory, "abcd0001")).sort()).toEqual(
      ["geometry.json", "source.png", "top.png", "bottom.png"].sort(),
    );
    expect(Array.from(readFileSync(join(directory, "abcd0001", "top.png")))).toEqual([4, 5, 6]);
  });

  it("relit la géométrie et donne chaque image", () => {
    const { store } = setup();
    store.create("abcd0001", geometry, images);
    expect(store.get("abcd0001")?.geometry).toEqual(geometry);
    expect(Array.from(store.getImage("abcd0001", "source") ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(store.getImage("abcd0001", "bottom") ?? [])).toEqual([7, 8, 9]);
  });

  it("ne laisse aucun fichier temporaire derrière lui", () => {
    const { store, directory } = setup();
    store.create("abcd0001", geometry, images);
    store.update("abcd0001", { ...geometry, fermeture: 20 }, { top: images.top, bottom: images.bottom });
    expect(readdirSync(join(directory, "abcd0001")).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("garde l'image d'origine quand la mise à jour n'en donne pas, et change la version", async () => {
    const { store } = setup();
    const first = store.create("abcd0001", geometry, images);
    await sleep(15);
    const second = store.update(
      "abcd0001",
      { ...geometry, fermeture: 20 },
      { top: new Uint8Array([9, 9, 9, 9]), bottom: images.bottom },
    );
    expect(second.geometry.fermeture).toBe(20);
    expect(Array.from(store.getImage("abcd0001", "source") ?? [])).toEqual([1, 2, 3]);
    expect(second.version).not.toBe(first.version);
  });

  it("supprime le dossier de l'expression", () => {
    const { store, directory } = setup();
    store.create("abcd0001", geometry, images);
    store.delete("abcd0001");
    expect(existsSync(join(directory, "abcd0001"))).toBe(false);
    expect(store.get("abcd0001")).toBeUndefined();
  });
});

describe("createExpressionStore : lister", () => {
  it("rend une liste vide quand data/heads n'existe pas encore", () => {
    expect(setup().store.list()).toEqual([]);
  });

  it("liste les expressions par ordre alphabétique de leur nom, quel que soit l'ordre de création", () => {
    // Copier le dossier data/ ne garde pas les dates de création : l'ordre ne peut pas en dépendre.
    const { store } = setup();
    store.create("bbbb0002", { ...geometry, nom: "Méfiant" }, images);
    store.create("aaaa0001", { ...geometry, nom: "Fatigué" }, images);
    store.create("cccc0003", { ...geometry, nom: "En colère" }, images);
    expect(store.list().map(({ name }) => name)).toEqual(["En colère", "Fatigué", "Méfiant"]);
  });

  it("départage deux expressions de même nom par leur identifiant", () => {
    const { store } = setup();
    store.create("bbbb0002", { ...geometry, nom: "Neutre" }, images);
    store.create("aaaa0001", { ...geometry, nom: "Neutre" }, images);
    expect(store.list().map(({ id }) => id)).toEqual(["aaaa0001", "bbbb0002"]);
  });

  it("ignore, en le disant, un dossier dont la géométrie est abîmée, et un dossier sans géométrie", () => {
    const { store, directory, messages } = setup();
    store.create("abcd0001", geometry, images);
    mkdirSync(join(directory, "abcd0002"), { recursive: true });
    writeFileSync(join(directory, "abcd0002", "geometry.json"), "{ pas du json");
    mkdirSync(join(directory, "abcd0003"), { recursive: true });
    mkdirSync(join(directory, "pas-un-id"), { recursive: true });
    expect(store.list().map(({ id }) => id)).toEqual(["abcd0001"]);
    expect(messages.some((message) => message.includes("abcd0002"))).toBe(true);
  });
});

describe("createExpressionStore : identifiants", () => {
  it("n'accepte que huit caractères minuscules ou chiffres : jamais un chemin", () => {
    const { store } = setup();
    for (const id of ["../abcd0001", "abcd/0001", "ABCD0001", "abc", "photo", "abcd00011"]) {
      expect(() => store.create(id, geometry, images)).toThrow("identifiant d'expression invalide");
      expect(store.get(id)).toBeUndefined();
      expect(store.getImage(id, "top")).toBeUndefined();
      expect(() => store.delete(id)).toThrow("identifiant d'expression invalide");
    }
  });
});
