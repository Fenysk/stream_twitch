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

  it("refuse une autre version du format", () => {
    expect(HeadFileSchema.safeParse({ ...file, format: "tete-south-park/2" }).success).toBe(false);
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
    const head = toHead(HeadFileSchema.parse(file));
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
    });
  });
});
