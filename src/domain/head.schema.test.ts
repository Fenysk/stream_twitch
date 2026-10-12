import { describe, expect, it } from "vitest";
import { HeadFileSchema, toHead } from "./head.schema";

const file = {
  format: "tete-south-park/1",
  source: "tete fenysk.png",
  image: { largeur: 577, hauteur: 433 },
  coupe: { gauche: { x: 240.3, y: 333.2 }, droite: { x: 345.1, y: 334.2 } },
  levres: { trait: true, epaisseur: 10 },
  animation: {
    rythmeMs: 110,
    amplitude: 1.3,
    probabiliteFermee: 0.22,
    poses: [
      { pivot: "droite", angle: 7 },
      { pivot: "gauche", angle: -14 },
      { pivot: "centre", angle: 3, levee: 0.11 },
    ],
  },
};

describe("HeadFileSchema", () => {
  it("accepte le fichier de l'outil, avec ses champs que le serveur n'utilise pas", () => {
    expect(HeadFileSchema.safeParse(file).success).toBe(true);
  });

  it("refuse une autre version du format, et lit les formats 1 et 2", () => {
    expect(HeadFileSchema.safeParse({ ...file, format: "tete-south-park/3" }).success).toBe(false);
    expect(HeadFileSchema.safeParse({ ...file, format: "tete-south-park/2" }).success).toBe(true);
  });

  it("refuse une probabilité de bouche fermée hors de 0 à 1", () => {
    const animation = { ...file.animation, probabiliteFermee: 1.5 };
    expect(HeadFileSchema.safeParse({ ...file, animation }).success).toBe(false);
  });

  it("refuse moins de deux poses : la bouche ne pourrait pas changer de pose", () => {
    const animation = { ...file.animation, poses: [{ pivot: "droite", angle: 7 }] };
    expect(HeadFileSchema.safeParse({ ...file, animation }).success).toBe(false);
  });

  it("refuse une pose centrale sans levée", () => {
    const animation = {
      ...file.animation,
      poses: [
        { pivot: "centre", angle: 3 },
        { pivot: "droite", angle: 7 },
      ],
    };
    expect(HeadFileSchema.safeParse({ ...file, animation }).success).toBe(false);
  });
});

describe("toHead", () => {
  it("convertit les noms du fichier vers ceux du domaine", () => {
    const head = toHead(HeadFileSchema.parse(file), { id: "photo", version: "1" });
    expect(head).toEqual({
      width: 577,
      height: 433,
      cut: { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } },
      poses: [
        { pivot: "right", angle: 7 },
        { pivot: "left", angle: -14 },
        { pivot: "center", angle: 3, lift: 0.11 },
      ],
      rhythm: 110,
      opening: 1.3,
      closedChance: 0.22,
      closing: 0,
      topHeight: 333.7,
      expression: { id: "photo", version: "1" },
    });
  });

  it("prend la hauteur du haut du fichier quand il la donne, sinon la distance du haut de l'image au milieu de la coupe", () => {
    const measured = HeadFileSchema.parse({ ...file, hauteurHaut: 331.5 });
    expect(toHead(measured, { id: "photo", version: "1" }).topHeight).toBe(331.5);
    expect(toHead(HeadFileSchema.parse(file), { id: "photo", version: "1" }).topHeight).toBe(333.7);
  });

  it("refuse une hauteur du haut qui n'est pas positive", () => {
    expect(HeadFileSchema.safeParse({ ...file, hauteurHaut: 0 }).success).toBe(false);
    expect(HeadFileSchema.safeParse({ ...file, hauteurHaut: -3 }).success).toBe(false);
  });
});

describe("le format 2 d'une expression", () => {
  const expression = {
    ...file,
    format: "tete-south-park/2",
    nom: "Méfiant",
    levres: { trait: false, epaisseur: 10 },
    fermeture: 14,
  };

  it("accepte le nom, les lèvres et la fermeture", () => {
    expect(HeadFileSchema.safeParse(expression).success).toBe(true);
  });

  it("convertit la fermeture en closing, et garde 0 quand elle manque", () => {
    expect(toHead(HeadFileSchema.parse(expression), { id: "photo", version: "1" }).closing).toBe(14);
    expect(toHead(HeadFileSchema.parse(file), { id: "photo", version: "1" }).closing).toBe(0);
  });

  it("refuse une fermeture négative ou des lèvres sans épaisseur", () => {
    expect(HeadFileSchema.safeParse({ ...expression, fermeture: -1 }).success).toBe(false);
    expect(HeadFileSchema.safeParse({ ...expression, levres: { trait: true } }).success).toBe(false);
  });
});
