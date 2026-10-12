import { describe, expect, it } from "vitest";
import { REFERENCE_RATIO, toClosedTransform, toPoseTransform, toReferenceLength } from "./head.rules";
import type { Cut, Pose, PoseBasis, PoseFactors, PoseTransform } from "./head.types";

// La photo : sa coupe, et sa hauteur du haut (la distance du haut de l'image au milieu de la coupe), sans bande dessinée.
const cut: Cut = { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } };
const photoBasis: PoseBasis = { closing: 0, topHeight: (cut.left.y + cut.right.y) / 2 };
const unit: PoseFactors = { tilt: 1, opening: 1, scale: 1 };

// Les sept poses de la photo (tete.json), dans les noms du domaine.
const PHOTO_POSES: Pose[] = [
  { pivot: "right", angle: 7 },
  { pivot: "right", angle: 14 },
  { pivot: "left", angle: -7 },
  { pivot: "left", angle: -14 },
  { pivot: "center", angle: 0, lift: 0.07 },
  { pivot: "center", angle: 3, lift: 0.11 },
  { pivot: "center", angle: -3, lift: 0.11 },
];

// Le calcul d'avant la correction, recopié tel quel : la photo (closing 0, référence = longueur de sa coupe) doit donner
// exactement les mêmes transformations.
const legacyPoseTransform = (pose: Pose, from: Cut, scaling: PoseFactors): PoseTransform => {
  const angle = pose.angle * scaling.tilt * scaling.scale;
  if (pose.pivot !== "center") {
    return { origin: pose.pivot === "left" ? from.left : from.right, shift: { x: 0, y: 0 }, angle };
  }
  const dx = from.right.x - from.left.x;
  const dy = from.right.y - from.left.y;
  const length = Math.hypot(dx, dy) || 1;
  const lift = pose.lift * length * scaling.opening * scaling.scale;
  return {
    origin: { x: (from.left.x + from.right.x) / 2, y: (from.left.y + from.right.y) / 2 },
    shift: { x: (dy / length) * lift, y: 0 - (dx / length) * lift },
    angle,
  };
};

describe("la photo est rendue à l'identique", () => {
  const settings: PoseFactors[] = [
    { tilt: 1, opening: 1.8, scale: 1 },
    { tilt: 2, opening: 3, scale: 2 },
    { tilt: 0.5, opening: 2, scale: 1.5 },
    { tilt: 1.3, opening: 1.3, scale: 0.3 },
  ];

  it("donne exactement les mêmes transformations qu'avant pour les sept poses, à tous les réglages", () => {
    for (const scaling of settings) {
      for (const pose of PHOTO_POSES) {
        expect(toPoseTransform(pose, cut, scaling, photoBasis)).toEqual(
          legacyPoseTransform(pose, cut, scaling),
        );
      }
    }
  });

  it("prend pour référence la longueur de la coupe de la photo, rapportée à sa hauteur du haut", () => {
    const length = Math.hypot(cut.right.x - cut.left.x, cut.right.y - cut.left.y);
    expect(toReferenceLength(photoBasis.topHeight)).toBe(length);
    expect(REFERENCE_RATIO).toBeCloseTo(0.314, 3);
  });
});

describe("toPoseTransform : la référence est la hauteur du haut, pas la longueur de la coupe", () => {
  const flat: Cut = { left: { x: 10, y: 100 }, right: { x: 110, y: 100 } };
  // Une hauteur du haut pour laquelle la longueur de référence vaut la moitié de la coupe (50 px sur 100).
  const halfBasis: PoseBasis = { closing: 0, topHeight: 50 / REFERENCE_RATIO };

  it("lève de levée × référence × opening : la moitié de ce qu'une coupe de 100 px lèverait", () => {
    const lifted = toPoseTransform(
      { pivot: "center", angle: 0, lift: 0.1 },
      flat,
      { ...unit, opening: 2 },
      halfBasis,
    );
    expect(lifted.shift.x).toBeCloseTo(0, 9);
    expect(lifted.shift.y).toBeCloseTo(-10, 9);
  });

  it("réduit l'angle pour que l'écart au bout de la coupe soit celui d'une coupe de la longueur de référence", () => {
    const rotated = toPoseTransform({ pivot: "right", angle: 14 }, flat, unit, halfBasis);
    const expected = (Math.asin(0.5 * Math.sin((14 * Math.PI) / 180)) * 180) / Math.PI;
    expect(rotated.angle).toBeCloseTo(expected, 9);
    // L'écart au bout de la coupe : 100 × sin(angle réduit) = 50 × sin(14°).
    expect(100 * Math.sin((rotated.angle * Math.PI) / 180)).toBeCloseTo(
      50 * Math.sin((14 * Math.PI) / 180),
      9,
    );
  });

  it("garde le signe de l'angle, pour les trois pivots", () => {
    expect(toPoseTransform({ pivot: "left", angle: -14 }, flat, unit, halfBasis).angle).toBeLessThan(0);
    expect(
      toPoseTransform({ pivot: "center", angle: -3, lift: 0.1 }, flat, unit, halfBasis).angle,
    ).toBeLessThan(0);
    expect(
      toPoseTransform({ pivot: "center", angle: 3, lift: 0.1 }, flat, unit, halfBasis).angle,
    ).toBeGreaterThan(0);
  });

  it("applique les facteurs tilt et scale à l'angle déjà réduit", () => {
    const base = toPoseTransform({ pivot: "right", angle: 14 }, flat, unit, halfBasis).angle;
    const scaled = toPoseTransform(
      { pivot: "right", angle: 14 },
      flat,
      { tilt: 2, opening: 1, scale: 1.5 },
      halfBasis,
    );
    expect(scaled.angle).toBeCloseTo(base * 3, 9);
  });

  it("ne dépasse jamais le quart de tour pour une coupe très courte devant la référence", () => {
    const short: Cut = { left: { x: 50, y: 100 }, right: { x: 52, y: 100 } };
    expect(toPoseTransform({ pivot: "right", angle: 14 }, short, unit, photoBasis).angle).toBeLessThanOrEqual(
      90,
    );
  });

  it("n'ajuste pas l'angle quand les deux points de la coupe sont confondus", () => {
    const point = { x: 30, y: 40 };
    const degenerate = { left: point, right: point };
    expect(toPoseTransform({ pivot: "left", angle: 14 }, degenerate, unit, photoBasis).angle).toBe(14);
  });
});

describe("toPoseTransform : toutes les poses partent de la position fermée", () => {
  const flat: Cut = { left: { x: 10, y: 100 }, right: { x: 110, y: 100 } };
  // Une hauteur du haut pour laquelle la longueur de référence vaut celle de la coupe (100 px).
  const reference = (closing: number): PoseBasis => ({ closing, topHeight: 100 / REFERENCE_RATIO });

  it("ajoute le closing à une pose à pivot : la moitié haute descend, puis tourne autour de la charnière", () => {
    const pose = toPoseTransform({ pivot: "right", angle: 10 }, flat, unit, reference(8));
    const radians = (pose.angle * Math.PI) / 180;
    expect(pose.origin).toEqual(flat.right);
    // Le décalage de 8 px vers le bas, tourné comme la moitié haute.
    expect(pose.shift.x).toBeCloseTo(-8 * Math.sin(radians), 9);
    expect(pose.shift.y).toBeCloseTo(8 * Math.cos(radians), 9);
  });

  it("compte la levée depuis la position fermée : une levée de 0 donne exactement la pose fermée", () => {
    const flatLift = toPoseTransform({ pivot: "center", angle: 0, lift: 0 }, flat, unit, reference(8));
    const closed = toClosedTransform(flat, 8);
    expect(flatLift.shift.x).toBeCloseTo(closed.shift.x, 9);
    expect(flatLift.shift.y).toBeCloseTo(closed.shift.y, 9);
    expect(flatLift.angle).toBe(0);
  });

  it("lève de la levée moins le closing : 20 px de levée sur 8 px de closing ne montent que de 12 px", () => {
    // levée 0,2 × référence 100 px × opening 1 = 20 px.
    const lifted = toPoseTransform({ pivot: "center", angle: 0, lift: 0.2 }, flat, unit, reference(8));
    expect(lifted.shift.y).toBeCloseTo(-12, 9);
  });

  it("n'ajoute rien avec un closing de 0 : la photo ne bouge pas", () => {
    const pose = toPoseTransform({ pivot: "left", angle: -14 }, flat, unit, reference(0));
    expect(pose.shift).toEqual({ x: 0, y: 0 });
  });
});

describe("l'écart des poses, rapporté à la hauteur du haut", () => {
  // Le plus grand écart perpendiculaire à la coupe, le long de la coupe, entre la pose et la position fermée.
  const widestGap = (pose: Pose, from: Cut, scaling: PoseFactors, basis: PoseBasis): number => {
    const { origin, shift, angle } = toPoseTransform(pose, from, scaling, basis);
    const closed = toClosedTransform(from, basis.closing);
    const radians = (angle * Math.PI) / 180;
    const dx = from.right.x - from.left.x;
    const dy = from.right.y - from.left.y;
    const length = Math.hypot(dx, dy);
    const normal = { x: dy / length, y: -dx / length };
    let widest = 0;
    for (let step = 0; step <= 20; step += 1) {
      const t = step / 20;
      const start = { x: from.left.x + dx * t, y: from.left.y + dy * t };
      // Fermée : le point descend de closing. Ouverte : le point descend de closing, puis tourne, puis se décale.
      const base = { x: start.x + closed.shift.x, y: start.y + closed.shift.y };
      const shifted = { x: start.x - origin.x, y: start.y - origin.y };
      const moved = {
        x: origin.x + shifted.x * Math.cos(radians) - shifted.y * Math.sin(radians) + shift.x,
        y: origin.y + shifted.x * Math.sin(radians) + shifted.y * Math.cos(radians) + shift.y,
      };
      widest = Math.max(widest, Math.abs((moved.x - base.x) * normal.x + (moved.y - base.y) * normal.y));
    }
    return widest;
  };

  // Neutre : coupe de 208 px (0,88 de la hauteur du haut), closing 13. La photo : coupe de 105 px (0,31), closing 0.
  const neutral: Cut = { left: { x: 62, y: 237.5 }, right: { x: 270, y: 237.5 } };
  const neutralBasis: PoseBasis = { closing: 13, topHeight: 237.5 };

  it("est la même part de la hauteur du haut pour Neutre et pour la photo, à pose égale", () => {
    for (const pose of PHOTO_POSES) {
      const photo = widestGap(pose, cut, unit, photoBasis) / photoBasis.topHeight;
      const neutralGap = widestGap(pose, neutral, unit, neutralBasis) / neutralBasis.topHeight;
      expect(neutralGap).toBeCloseTo(photo, 2);
    }
  });
});
