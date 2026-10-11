import { describe, expect, it } from "vitest";
import { toClosedTransform, toHeadView, toPoseTransform, toStageLayout } from "./head.rules";
import type { Cut, Head, Pose, PoseFactors } from "./head.types";

const cut: Cut = { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } };
// Les réglages d'Alexis : l'angle tel quel (tilt 1), la levée multipliée par 1,8 (opening).
const factors: PoseFactors = { tilt: 1, opening: 1.8, scale: 1 };

describe("toPoseTransform", () => {
  it("tourne autour de la charnière droite, l'angle multiplié par le tilt", () => {
    const pose: Pose = { pivot: "right", angle: 14 };
    const transform = toPoseTransform(pose, cut, factors);
    expect(transform.origin).toEqual(cut.right);
    expect(transform.shift).toEqual({ x: 0, y: 0 });
    expect(transform.angle).toBeCloseTo(14, 6);
  });

  it("tourne autour de la charnière gauche, dans le sens inverse pour un angle négatif", () => {
    const pose: Pose = { pivot: "left", angle: -7 };
    const transform = toPoseTransform(pose, cut, factors);
    expect(transform.origin).toEqual(cut.left);
    expect(transform.shift).toEqual({ x: 0, y: 0 });
    expect(transform.angle).toBeCloseTo(-7, 6);
  });

  it("lève perpendiculairement à la coupe puis tourne autour de son milieu", () => {
    const pose: Pose = { pivot: "center", angle: 3, lift: 0.11 };
    const transform = toPoseTransform(pose, cut, factors);
    expect(transform.origin.x).toBeCloseTo(292.7, 6);
    expect(transform.origin.y).toBeCloseTo(333.7, 6);
    expect(transform.shift.x).toBeCloseTo(0.198, 3);
    expect(transform.shift.y).toBeCloseTo(-20.7504, 3);
    expect(transform.angle).toBeCloseTo(3, 6);
  });

  it("multiplie l'angle par le tilt sans toucher à la levée", () => {
    const pose: Pose = { pivot: "center", angle: 3, lift: 0.11 };
    const base = toPoseTransform(pose, cut, { tilt: 1, opening: 1.8, scale: 1 });
    const tilted = toPoseTransform(pose, cut, { tilt: 2.5, opening: 1.8, scale: 1 });
    expect(tilted.angle).toBeCloseTo(7.5, 6);
    expect(tilted.shift).toEqual(base.shift);
  });

  it("multiplie la levée par l'opening sans toucher à l'angle", () => {
    const pose: Pose = { pivot: "center", angle: 3, lift: 0.11 };
    const base = toPoseTransform(pose, cut, { tilt: 1, opening: 1, scale: 1 });
    const opened = toPoseTransform(pose, cut, { tilt: 1, opening: 2.5, scale: 1 });
    expect(opened.angle).toBe(base.angle);
    expect(opened.shift.x).toBeCloseTo(base.shift.x * 2.5, 6);
    expect(opened.shift.y).toBeCloseTo(base.shift.y * 2.5, 6);
  });

  it("multiplie l'angle et la levée par le scale, après le tilt et l'opening", () => {
    const pose: Pose = { pivot: "center", angle: 3, lift: 0.11 };
    const base = toPoseTransform(pose, cut, { tilt: 1, opening: 1.8, scale: 1 });
    const scaled = toPoseTransform(pose, cut, { tilt: 1, opening: 1.8, scale: 1.5 });
    expect(scaled.angle).toBeCloseTo(base.angle * 1.5, 9);
    expect(scaled.shift.x).toBeCloseTo(base.shift.x * 1.5, 9);
    expect(scaled.shift.y).toBeCloseTo(base.shift.y * 1.5, 9);
    expect(scaled.origin).toEqual(base.origin);
  });

  it("multiplie l'angle d'une pose à pivot par le tilt puis par le scale", () => {
    const pose: Pose = { pivot: "left", angle: -14 };
    expect(toPoseTransform(pose, cut, { tilt: 1, opening: 1.8, scale: 1.5 }).angle).toBeCloseTo(-21, 9);
    expect(toPoseTransform(pose, cut, { tilt: 2, opening: 1.8, scale: 0.5 }).angle).toBeCloseTo(-14, 9);
  });

  it("ne soulève pas une pose à pivot : l'opening ne change pas son angle", () => {
    const pose: Pose = { pivot: "right", angle: 14 };
    expect(toPoseTransform(pose, cut, { tilt: 1, opening: 2.5, scale: 1 }).angle).toBeCloseTo(14, 6);
  });

  it("ne lève pas quand les deux points de la coupe sont confondus", () => {
    const point = { x: 10, y: 20 };
    const pose: Pose = { pivot: "center", angle: 0, lift: 0.5 };
    const transform = toPoseTransform(pose, { left: point, right: point }, factors);
    expect(transform.shift).toEqual({ x: 0, y: 0 });
  });
});

describe("toStageLayout", () => {
  it("ajoute 17 % de la largeur de chaque côté, 31 % de la hauteur en haut et 6 % en bas, arrondis", () => {
    expect(toStageLayout({ width: 577, height: 433 })).toEqual({
      width: 773,
      height: 593,
      left: 98,
      top: 134,
    });
  });

  it("laisse la même part de marge à toutes les images, hautes comme larges", () => {
    expect(toStageLayout({ width: 332, height: 476 })).toEqual({
      width: 444,
      height: 653,
      left: 56,
      top: 148,
    });
  });

  it("garde de la place sous l'image : la tête entière tourne autour de son bas-centre et ne sort pas par le bas", () => {
    for (const size of [
      { width: 577, height: 433 },
      { width: 332, height: 476 },
    ]) {
      const { height, top } = toStageLayout(size);
      expect(height - top - size.height).toBeGreaterThan(0);
    }
  });
});

describe("toHeadView", () => {
  it("garde la géométrie de la tête, le tilt, l'opening, le scale, la bouche et la pose de repos donnés", () => {
    const head: Head = {
      width: 577,
      height: 433,
      cut,
      poses: [{ pivot: "left", angle: -7 }],
      rhythm: 110,
      opening: 1.3,
      closedChance: 0.22,
      closing: 12,
      expression: { id: "photo", version: "1" },
    };
    const idle = { angle: 2, lift: 0.005 };
    expect(toHeadView(head, { tilt: 1, opening: 2, scale: 0.5 }, { kind: "closed" }, idle)).toEqual({
      width: 577,
      height: 433,
      cut,
      tilt: 1,
      opening: 2,
      scale: 0.5,
      closing: 12,
      expression: { id: "photo", version: "1" },
      idle,
      mouth: { kind: "closed" },
    });
  });
});

describe("toClosedTransform", () => {
  it("descend la moitié haute de closing px, perpendiculairement à la coupe, à l'inverse de la levée", () => {
    const flat = toClosedTransform({ left: { x: 10, y: 50 }, right: { x: 110, y: 50 } }, 8);
    expect(flat.origin).toEqual({ x: 60, y: 50 });
    expect(flat.shift.x).toBeCloseTo(0, 9);
    expect(flat.shift.y).toBeCloseTo(8, 9);
    expect(flat.angle).toBe(0);
  });

  it("suit l'inclinaison de la coupe : le décalage reste perpendiculaire", () => {
    const transform = toClosedTransform(cut, 10);
    const lift = toPoseTransform({ pivot: "center", angle: 0, lift: 1 }, cut, {
      tilt: 1,
      opening: 1,
      scale: 1,
    });
    const length = Math.hypot(cut.right.x - cut.left.x, cut.right.y - cut.left.y);
    expect(transform.shift.x).toBeCloseTo((-lift.shift.x / length) * 10, 9);
    expect(transform.shift.y).toBeCloseTo((-lift.shift.y / length) * 10, 9);
  });

  it("ne bouge pas avec une fermeture de 0, ni quand les deux points de la coupe sont confondus", () => {
    expect(toClosedTransform(cut, 0).shift).toEqual({ x: 0, y: 0 });
    const point = { x: 5, y: 5 };
    expect(toClosedTransform({ left: point, right: point }, 9).shift).toEqual({ x: 0, y: 0 });
  });
});
