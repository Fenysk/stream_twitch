import { describe, expect, it } from "vitest";
import type { ExpressionImageBytes } from "../domain/expression.rules";
import type { HeadFile } from "../domain/head.schema";
import type { ExpressionImagePart, Head } from "../domain/head.types";
import {
  createExpressionLibrary,
  type ExpressionDraft,
  type ExpressionStore,
  type StoredExpression,
} from "./expression.usecase";

const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

const geometry = (format: "tete-south-park/1" | "tete-south-park/2" = "tete-south-park/2"): HeadFile => ({
  format,
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
});

const photoHead: Head = {
  width: 577,
  height: 433,
  cut: { left: { x: 240, y: 333 }, right: { x: 345, y: 334 } },
  poses: [
    { pivot: "right", angle: 7 },
    { pivot: "left", angle: -7 },
  ],
  rhythm: 110,
  opening: 1.3,
  closedChance: 0.22,
  closing: 0,
  topHeight: 333.5,
  expression: { id: "photo", version: "1" },
};

const photoImages = { top: png(577, 433), bottom: png(577, 433) };

// Un faux disque : il garde ce qu'on lui écrit, et donne une version qui change à chaque écriture.
const createFakeStore = () => {
  const entries = new Map<string, { geometry: HeadFile; images: ExpressionImageBytes; version: number }>();
  let versions = 0;
  const toStored = (id: string): StoredExpression | undefined => {
    const entry = entries.get(id);
    return (
      entry && {
        id,
        name: entry.geometry.nom ?? id,
        version: String(entry.version),
        geometry: entry.geometry,
      }
    );
  };
  const store: ExpressionStore = {
    list: () => [...entries.keys()].flatMap((id) => toStored(id) ?? []),
    get: toStored,
    getImage: (id: string, part: ExpressionImagePart) => entries.get(id)?.images[part],
    create(id, file, images) {
      versions += 1;
      entries.set(id, { geometry: file, images, version: versions });
      return toStored(id) as StoredExpression;
    },
    update(id, file, images) {
      const previous = entries.get(id);
      versions += 1;
      entries.set(id, {
        geometry: file,
        images: { ...images, source: images.source ?? previous?.images.source },
        version: versions,
      } as never);
      return toStored(id) as StoredExpression;
    },
    delete: (id) => void entries.delete(id),
  };
  return { store, entries };
};

const setup = () => {
  const { store, entries } = createFakeStore();
  const changes = { count: 0 };
  let counter = 0;
  const library = createExpressionLibrary({
    builtIn: { head: photoHead, geometry: geometry("tete-south-park/1"), images: photoImages },
    store,
    createId: () => `abcd000${++counter}`,
    onChange: () => {
      changes.count += 1;
    },
  });
  return { library, entries, changes };
};

const draft = (name = "Méfiant", override: Partial<ExpressionImageBytes> = {}): ExpressionDraft => ({
  name,
  geometry: geometry(),
  images: { source: png(332, 476), top: png(332, 476), bottom: png(332, 476), ...override },
});

describe("la liste des expressions", () => {
  it("commence par la photo intégrée, nommée « Photo »", () => {
    const { library } = setup();
    expect(library.list()).toEqual([{ id: "photo", name: "Photo", version: "1", isBuiltIn: true }]);
  });

  it("ajoute les expressions enregistrées, avec leur nom et leur version", () => {
    const { library } = setup();
    library.create(draft("Méfiant"));
    library.create(draft("Fatigué"));
    expect(library.list().map(({ id, name, isBuiltIn }) => [id, name, isBuiltIn])).toEqual([
      ["photo", "Photo", true],
      ["abcd0001", "Méfiant", false],
      ["abcd0002", "Fatigué", false],
    ]);
  });
});

describe("create", () => {
  it("enregistre l'expression au format 2, avec son nom, et prévient du changement", () => {
    const { library, entries, changes } = setup();
    const result = library.create(draft("Méfiant"));
    expect(result).toEqual({
      ok: true,
      value: { id: "abcd0001", name: "Méfiant", version: "1", isBuiltIn: false },
    });
    expect(entries.get("abcd0001")?.geometry).toMatchObject({ format: "tete-south-park/2", nom: "Méfiant" });
    expect(changes.count).toBe(1);
  });

  it("refuse une image qui n'est pas un PNG, sans rien écrire ni prévenir", () => {
    const { library, entries, changes } = setup();
    const result = library.create(draft("Méfiant", { top: new TextEncoder().encode("pas une image") }));
    expect(result).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "top", message: "ce n'est pas une image PNG" }],
    });
    expect(entries.size).toBe(0);
    expect(changes.count).toBe(0);
  });

  it("demande l'image d'origine à la création", () => {
    const { library } = setup();
    const { source: _source, ...halves } = draft().images;
    const result = library.create({ ...draft(), images: halves });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toContainEqual({
      path: "source",
      message: "l'image d'origine manque",
    });
  });
});

describe("lire une expression", () => {
  it("donne le détail de la photo avec sa géométrie, et celui d'une expression enregistrée", () => {
    const { library } = setup();
    library.create(draft("Méfiant"));
    expect(library.getDetail("photo")?.geometry.format).toBe("tete-south-park/1");
    expect(library.getDetail("abcd0001")).toMatchObject({
      id: "abcd0001",
      name: "Méfiant",
      isBuiltIn: false,
    });
    expect(library.getDetail("inconnue")).toBeUndefined();
  });

  it("donne les images : la photo n'a pas d'image d'origine, une expression enregistrée a les trois", () => {
    const { library } = setup();
    library.create(draft("Méfiant"));
    expect(library.getImage("photo", "top")).toBe(photoImages.top);
    expect(library.getImage("photo", "source")).toBeUndefined();
    expect(library.getImage("abcd0001", "source")).toBeDefined();
    expect(library.getImage("abcd0001", "bottom")).toBeDefined();
    expect(library.getImage("inconnue", "top")).toBeUndefined();
  });

  it("construit la tête d'une expression, avec sa fermeture et sa version", () => {
    const { library } = setup();
    library.create(draft("Méfiant"));
    expect(library.getHead("photo")).toBe(photoHead);
    const head = library.getHead("abcd0001");
    expect(head?.expression).toEqual({ id: "abcd0001", version: "1" });
    expect(head?.closing).toBe(14);
    expect(head?.width).toBe(332);
    expect(library.getHead("inconnue")).toBeUndefined();
  });
});

describe("update", () => {
  it("remplace la géométrie et le nom, garde l'image d'origine absente du corps, change la version", () => {
    const { library, entries, changes } = setup();
    library.create(draft("Méfiant"));
    const { source: _source, ...halves } = draft().images;
    const result = library.update("abcd0001", {
      name: "Très méfiant",
      geometry: { ...geometry(), fermeture: 20 },
      images: halves,
    });
    expect(result).toMatchObject({ ok: true, value: { id: "abcd0001", name: "Très méfiant", version: "2" } });
    expect(entries.get("abcd0001")?.geometry.fermeture).toBe(20);
    expect(entries.get("abcd0001")?.images.source).toBeDefined();
    expect(changes.count).toBe(2);
  });

  it("répond 404 pour une expression inconnue, et refuse de changer la photo", () => {
    const { library } = setup();
    expect(library.update("inconnue", draft())).toMatchObject({ ok: false, status: 404 });
    expect(library.update("photo", draft())).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "la photo ne se change pas : enregistre-la sous un autre nom" }],
    });
  });

  it("refuse une mise à jour invalide en gardant l'expression telle qu'elle était", () => {
    const { library, entries } = setup();
    library.create(draft("Méfiant"));
    const result = library.update("abcd0001", draft("Méfiant", { bottom: png(10, 10) }));
    expect(result.ok).toBe(false);
    expect(entries.get("abcd0001")?.geometry.fermeture).toBe(14);
  });
});

describe("delete", () => {
  it("supprime l'expression et prévient du changement", () => {
    const { library, entries, changes } = setup();
    library.create(draft("Méfiant"));
    expect(library.delete("abcd0001")).toEqual({ ok: true, value: undefined });
    expect(entries.size).toBe(0);
    expect(changes.count).toBe(2);
  });

  it("répond 404 pour une expression inconnue, et ne supprime jamais la photo", () => {
    const { library, changes } = setup();
    expect(library.delete("inconnue")).toMatchObject({ ok: false, status: 404 });
    expect(library.delete("photo")).toMatchObject({ ok: false, status: 422 });
    expect(changes.count).toBe(0);
  });
});

describe("getActive", () => {
  it("donne la photo quand aucune expression n'est choisie", () => {
    const { library } = setup();
    expect(library.getActive(undefined)).toEqual({ head: photoHead, found: true });
    expect(library.getActive("photo")).toEqual({ head: photoHead, found: true });
  });

  it("donne la tête de l'expression choisie", () => {
    const { library } = setup();
    library.create(draft("Méfiant"));
    const active = library.getActive("abcd0001");
    expect(active.found).toBe(true);
    expect(active.head.expression).toEqual({ id: "abcd0001", version: "1" });
  });

  it("retombe sur la photo quand l'expression choisie n'existe plus, en le disant", () => {
    const { library } = setup();
    expect(library.getActive("disparue")).toEqual({ head: photoHead, found: false });
  });
});
