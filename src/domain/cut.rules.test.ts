import { describe, expect, it } from "vitest";
import {
  type AlphaImage,
  toCutSuggestion,
  toDownscaledSize,
  toEditableCut,
  toExpressionGeometry,
  toMovedCut,
  toNudge,
  toOpaqueTop,
  toPartPolygons,
} from "./cut.rules";
import type { HeadFile } from "./head.schema";

// Une image d'essai : chaque bande de lignes dit de quelle colonne à quelle colonne elle est opaque (rien = transparente).
type Band = { rows: [number, number]; columns?: [number, number] };

const toImage = (width: number, height: number, bands: Band[]): AlphaImage => {
  const alpha = new Uint8Array(width * height);
  for (const { rows, columns } of bands) {
    if (!columns) continue;
    for (let y = rows[0]; y <= rows[1]; y += 1) {
      for (let x = columns[0]; x <= columns[1]; x += 1) alpha[y * width + x] = 255;
    }
  }
  return { width, height, alpha };
};

// Un personnage : un haut (lignes 2 à 39), une bande transparente (40 à 51), un bas (52 à 97), sur 100 × 100.
const withGap = (): AlphaImage =>
  toImage(100, 100, [
    { rows: [2, 39], columns: [20, 70] },
    { rows: [52, 97], columns: [10, 90] },
  ]);

describe("toCutSuggestion : une bande transparente entre le haut et le bas", () => {
  it("place la coupe au milieu de la bande", () => {
    const { cut } = toCutSuggestion(withGap());
    expect(cut.left.y).toBe(46);
    expect(cut.right.y).toBe(46);
  });

  it("pose les charnières sur les bords du personnage, à la hauteur de la coupe", () => {
    const { cut } = toCutSuggestion(withGap());
    expect(cut.left.x).toBe(10);
    expect(cut.right.x).toBe(91);
  });

  it("propose pour fermeture la hauteur de la bande plus 2 px, et décoche les lèvres", () => {
    const suggestion = toCutSuggestion(withGap());
    expect(suggestion.closing).toBe(14);
    expect(suggestion.lips.isDrawn).toBe(false);
    expect(suggestion.isGapFound).toBe(true);
  });

  it("garde la plus haute bande quand il y en a plusieurs", () => {
    const image = toImage(100, 100, [
      { rows: [2, 40], columns: [20, 70] },
      { rows: [43, 59], columns: [20, 70] },
      { rows: [70, 98], columns: [10, 90] },
    ]);
    const { cut } = toCutSuggestion(image);
    expect(cut.left.y).toBe(65);
  });

  it("ignore une bande trop haute ou trop basse dans l'image : ce n'est pas la bouche", () => {
    const image = toImage(100, 100, [
      { rows: [0, 3], columns: [20, 70] },
      { rows: [10, 98], columns: [10, 90] },
    ]);
    expect(toCutSuggestion(image).isGapFound).toBe(false);
  });

  it("ne prend pas le vide autour du personnage pour une bande", () => {
    const image = toImage(100, 100, [{ rows: [20, 80], columns: [10, 90] }]);
    expect(toCutSuggestion(image).isGapFound).toBe(false);
  });

  it("garde le bord le plus large entre le haut et le bas de la bande", () => {
    const image = toImage(100, 100, [
      { rows: [2, 39], columns: [5, 95] },
      { rows: [52, 97], columns: [30, 60] },
    ]);
    const { cut } = toCutSuggestion(image);
    expect(cut.left.x).toBe(5);
    expect(cut.right.x).toBe(96);
  });
});

describe("toCutSuggestion : sans bande transparente", () => {
  const solid = (): AlphaImage => toImage(200, 100, [{ rows: [0, 99], columns: [30, 169] }]);

  it("place la coupe à 70 % de la hauteur, sur les bords opaques de cette ligne", () => {
    const suggestion = toCutSuggestion(solid());
    expect(suggestion.cut.left).toEqual({ x: 30, y: 70 });
    expect(suggestion.cut.right).toEqual({ x: 170, y: 70 });
    expect(suggestion.isGapFound).toBe(false);
  });

  it("ne ferme rien, et trace les lèvres de 10 px", () => {
    const suggestion = toCutSuggestion(solid());
    expect(suggestion.closing).toBe(0);
    expect(suggestion.lips).toEqual({ isDrawn: true, thickness: 10 });
  });

  it("prend les bords de l'image quand la ligne de coupe est vide", () => {
    const image = toImage(200, 100, [{ rows: [0, 50], columns: [30, 169] }]);
    const { cut } = toCutSuggestion(image);
    expect(cut.left).toEqual({ x: 0, y: 70 });
    expect(cut.right).toEqual({ x: 200, y: 70 });
  });

  it("accepte une image sans aucun pixel opaque", () => {
    const image = toImage(50, 40, []);
    expect(toCutSuggestion(image).cut.left.y).toBe(28);
  });
});

describe("toPartPolygons", () => {
  const size = { width: 100, height: 80 };

  it("coupe l'image sur toute sa largeur, la moitié haute descendant d'1 px sous la coupe", () => {
    const { top, bottom } = toPartPolygons({ left: { x: 20, y: 40 }, right: { x: 80, y: 40 } }, size);
    expect(top).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 41 },
      { x: 0, y: 41 },
    ]);
    expect(bottom).toEqual([
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]);
  });

  it("prolonge une coupe penchée jusqu'aux bords de l'image", () => {
    const { bottom } = toPartPolygons({ left: { x: 20, y: 40 }, right: { x: 80, y: 46 } }, size);
    expect(bottom[0]).toEqual({ x: 0, y: 38 });
    expect(bottom[1]).toEqual({ x: 100, y: 48 });
  });

  it("coupe à l'horizontale quand les deux charnières sont à la même abscisse", () => {
    const { bottom } = toPartPolygons({ left: { x: 50, y: 30 }, right: { x: 50, y: 60 } }, size);
    expect(bottom[0]?.y).toBe(30);
    expect(bottom[1]?.y).toBe(30);
  });
});

describe("toMovedCut", () => {
  const size = { width: 100, height: 80 };
  const cut = { left: { x: 20, y: 40 }, right: { x: 80, y: 42 } };

  it("déplace une charnière à l'endroit donné", () => {
    const moved = toMovedCut(cut, { kind: "handle", side: "left", to: { x: 25.34, y: 44.66 } }, size);
    expect(moved.left).toEqual({ x: 25.3, y: 44.7 });
    expect(moved.right).toEqual(cut.right);
  });

  it("garde une charnière dans l'image", () => {
    const moved = toMovedCut(cut, { kind: "handle", side: "right", to: { x: 140, y: -9 } }, size);
    expect(moved.right).toEqual({ x: 100, y: 0 });
  });

  it("empêche une charnière de passer de l'autre côté de sa voisine", () => {
    const moved = toMovedCut(cut, { kind: "handle", side: "left", to: { x: 90, y: 40 } }, size);
    expect(moved.left.x).toBeLessThan(moved.right.x);
  });

  it("déplace la ligne : les deux charnières ensemble, gardant leur écart", () => {
    const moved = toMovedCut(cut, { kind: "line", dy: 10 }, size);
    expect(moved).toEqual({ left: { x: 20, y: 50 }, right: { x: 80, y: 52 } });
  });

  it("arrête la ligne quand une charnière touche le bord, sans la déformer", () => {
    const moved = toMovedCut(cut, { kind: "line", dy: 100 }, size);
    expect(moved.right.y).toBe(80);
    expect(moved.right.y - moved.left.y).toBe(2);
  });
});

describe("toNudge", () => {
  it("donne 1 px par flèche, 10 px avec Maj", () => {
    expect(toNudge("ArrowLeft", false)).toEqual({ x: -1, y: 0 });
    expect(toNudge("ArrowRight", false)).toEqual({ x: 1, y: 0 });
    expect(toNudge("ArrowUp", true)).toEqual({ x: 0, y: -10 });
    expect(toNudge("ArrowDown", true)).toEqual({ x: 0, y: 10 });
  });

  it("ignore les autres touches", () => {
    expect(toNudge("a", false)).toBeUndefined();
  });
});

describe("toDownscaledSize", () => {
  it("laisse une image qui tient déjà", () => {
    expect(toDownscaledSize({ width: 332, height: 476 }, 1600)).toEqual({ width: 332, height: 476 });
  });

  it("réduit le plus grand côté à la limite, en gardant les proportions", () => {
    expect(toDownscaledSize({ width: 3200, height: 2400 }, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(toDownscaledSize({ width: 1000, height: 4000 }, 1600)).toEqual({ width: 400, height: 1600 });
  });
});

describe("toExpressionGeometry", () => {
  const animation: HeadFile["animation"] = {
    rythmeMs: 110,
    amplitude: 1.3,
    probabiliteFermee: 0.22,
    poses: [
      { pivot: "droite", angle: 7 },
      { pivot: "gauche", angle: -7 },
    ],
  };

  it("écrit la géométrie au format 2, avec les noms de l'outil, arrondie au dixième de pixel", () => {
    const geometry = toExpressionGeometry({
      name: "Méfiant",
      size: { width: 332, height: 476 },
      cut: { left: { x: 61.04, y: 237.5 }, right: { x: 274.96, y: 237.5 } },
      lips: { isDrawn: false, thickness: 10 },
      closing: 11,
      topEdge: 5.04,
      animation,
    });
    expect(geometry).toEqual({
      format: "tete-south-park/2",
      nom: "Méfiant",
      image: { largeur: 332, hauteur: 476 },
      coupe: { gauche: { x: 61, y: 237.5 }, droite: { x: 275, y: 237.5 } },
      levres: { trait: false, epaisseur: 10 },
      fermeture: 11,
      hauteurHaut: 232.5,
      animation,
    });
  });

  it("mesure la hauteur du haut du haut des pixels opaques au milieu de la coupe, jamais moins d'1 px", () => {
    const base = {
      name: "Neutre",
      size: { width: 332, height: 476 },
      lips: { isDrawn: false, thickness: 10 },
      closing: 13,
      animation,
    };
    const tilted = { left: { x: 60, y: 200 }, right: { x: 270, y: 210 } };
    expect(toExpressionGeometry({ ...base, cut: tilted, topEdge: 5 }).hauteurHaut).toBe(200);
    expect(toExpressionGeometry({ ...base, cut: tilted, topEdge: 300 }).hauteurHaut).toBe(1);
  });

  it("est relue telle quelle pour retoucher l'expression", () => {
    const cut = { left: { x: 61, y: 237.5 }, right: { x: 275, y: 237.5 } };
    const geometry = toExpressionGeometry({
      name: "Fatigué",
      size: { width: 332, height: 476 },
      cut,
      lips: { isDrawn: true, thickness: 8 },
      closing: 4,
      topEdge: 0,
      animation,
    });
    expect(toEditableCut(geometry)).toEqual({
      name: "Fatigué",
      cut,
      lips: { isDrawn: true, thickness: 8 },
      closing: 4,
    });
  });

  it("relit une géométrie du format 1 : sans lèvres ni closing", () => {
    const firstFormat: HeadFile = {
      format: "tete-south-park/1",
      image: { largeur: 100, hauteur: 80 },
      coupe: { gauche: { x: 10, y: 40 }, droite: { x: 90, y: 41 } },
      animation,
    };
    expect(toEditableCut(firstFormat)).toEqual({
      name: "",
      cut: { left: { x: 10, y: 40 }, right: { x: 90, y: 41 } },
      lips: { isDrawn: false, thickness: 10 },
      closing: 0,
    });
  });
});

describe("toOpaqueTop", () => {
  it("donne la première ligne qui a un pixel opaque : le haut du personnage", () => {
    expect(toOpaqueTop(withGap())).toBe(2);
  });

  it("compte les lignes sous le seuil d'opacité pour transparentes", () => {
    const faint = toImage(10, 10, []);
    (faint.alpha as Uint8Array)[3 * 10 + 4] = 10;
    (faint.alpha as Uint8Array)[6 * 10 + 4] = 255;
    expect(toOpaqueTop(faint)).toBe(6);
  });

  it("donne 0 pour une image sans aucun pixel opaque", () => {
    expect(toOpaqueTop(toImage(10, 10, []))).toBe(0);
  });
});
