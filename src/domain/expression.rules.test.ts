import { describe, expect, it } from "vitest";
import { toExpressionIssues } from "./expression.rules";
import { ExpressionInputSchema, ExpressionNameSchema } from "./expression.schema";
import type { HeadFile } from "./head.schema";

const png = (width: number, height: number, extra = 0): Uint8Array => {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

const geometry: HeadFile = {
  format: "tete-south-park/2",
  nom: "Méfiant",
  image: { largeur: 332, hauteur: 476 },
  coupe: { gauche: { x: 60, y: 300 }, droite: { x: 270, y: 301 } },
  levres: { trait: false, epaisseur: 10 },
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

const images = { source: png(332, 476), top: png(332, 476), bottom: png(332, 476) };

describe("toExpressionIssues", () => {
  it("ne trouve rien à redire à une expression complète", () => {
    expect(toExpressionIssues(geometry, images)).toEqual([]);
  });

  it("accepte l'absence de l'image d'origine : à la mise à jour, on la garde", () => {
    const { source: _source, ...halves } = images;
    expect(toExpressionIssues(geometry, halves)).toEqual([]);
  });

  it("refuse une image qui n'est pas un PNG, en la nommant", () => {
    const issues = toExpressionIssues(geometry, {
      ...images,
      top: new TextEncoder().encode("pas une image"),
    });
    expect(issues).toEqual([{ path: "top", message: "ce n'est pas une image PNG" }]);
  });

  it("refuse une image de plus de 4 Mo", () => {
    const heavy = png(332, 476, 4 * 1024 * 1024);
    expect(toExpressionIssues(geometry, { ...images, source: heavy })).toEqual([
      { path: "source", message: "image trop lourde, 4 Mo au plus" },
    ]);
  });

  it("refuse une image de plus de 2000 px de côté", () => {
    const wide = { ...geometry, image: { largeur: 2001, hauteur: 476 } };
    const issues = toExpressionIssues(wide, {
      source: png(2001, 476),
      top: png(2001, 476),
      bottom: png(2001, 476),
    });
    expect(issues.map(({ path }) => path)).toContain("source");
    expect(issues[0]?.message).toBe("2000 px de côté au plus");
  });

  it("refuse une moitié qui n'a pas la taille de l'image de la géométrie", () => {
    const issues = toExpressionIssues(geometry, { ...images, bottom: png(300, 476) });
    expect(issues).toEqual([{ path: "bottom", message: "doit faire 332 × 476 px, comme l'image d'origine" }]);
  });

  it("refuse une charnière hors de l'image", () => {
    const outside = { ...geometry, coupe: { gauche: { x: -5, y: 300 }, droite: { x: 270, y: 500 } } };
    expect(toExpressionIssues(outside, images)).toEqual([
      { path: "geometry.coupe", message: "les deux charnières doivent être dans l'image" },
    ]);
  });

  it("refuse une fermeture plus haute que l'image", () => {
    expect(toExpressionIssues({ ...geometry, fermeture: 477 }, images)).toEqual([
      { path: "geometry.fermeture", message: "ne peut pas dépasser la hauteur de l'image" },
    ]);
  });

  it("refuse une hauteur du haut plus haute que l'image", () => {
    expect(toExpressionIssues({ ...geometry, hauteurHaut: 477 }, images)).toEqual([
      { path: "geometry.hauteurHaut", message: "ne peut pas dépasser la hauteur de l'image" },
    ]);
    expect(toExpressionIssues({ ...geometry, hauteurHaut: 236 }, images)).toEqual([]);
  });

  it("cumule les refus de plusieurs images", () => {
    const text = new TextEncoder().encode("x");
    const issues = toExpressionIssues(geometry, { source: text, top: text, bottom: png(1, 1) });
    expect(issues.map(({ path }) => path).sort()).toEqual(["bottom", "source", "top"]);
  });
});

describe("ExpressionNameSchema", () => {
  it("garde le nom sans les espaces autour", () => {
    expect(ExpressionNameSchema.parse("  Méfiant  ")).toBe("Méfiant");
  });

  it("refuse un nom vide, fait d'espaces, ou de plus de 40 caractères", () => {
    expect(ExpressionNameSchema.safeParse("").success).toBe(false);
    expect(ExpressionNameSchema.safeParse("   ").success).toBe(false);
    expect(ExpressionNameSchema.safeParse("x".repeat(41)).success).toBe(false);
    expect(ExpressionNameSchema.safeParse("x".repeat(40)).success).toBe(true);
  });
});

describe("ExpressionInputSchema", () => {
  const body = { name: "Méfiant", geometry, top: "AAAA", bottom: "AAAA" };

  it("accepte un corps avec ou sans image d'origine", () => {
    expect(ExpressionInputSchema.safeParse(body).success).toBe(true);
    expect(ExpressionInputSchema.safeParse({ ...body, source: "AAAA" }).success).toBe(true);
  });

  it("refuse un corps sans nom, sans géométrie ou sans moitié", () => {
    const { name: _name, ...withoutName } = body;
    const { geometry: _geometry, ...withoutGeometry } = body;
    const { top: _top, ...withoutTop } = body;
    for (const incomplete of [withoutName, withoutGeometry, withoutTop]) {
      expect(ExpressionInputSchema.safeParse(incomplete).success).toBe(false);
    }
  });
});
