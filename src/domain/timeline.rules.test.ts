import { describe, expect, it } from "vitest";
import { RULER_MAX_LABELS, toRulerStep, toRulerTimes } from "./timeline.rules";

describe("toRulerStep", () => {
  it("choisit un pas rond qui garde dix libellés au plus", () => {
    expect(toRulerStep(5)).toBe(1);
    expect(toRulerStep(9)).toBe(1);
    expect(toRulerStep(20)).toBe(5);
    expect(toRulerStep(60)).toBe(10);
    expect(toRulerStep(118.55)).toBe(15);
    expect(toRulerStep(300)).toBe(60);
  });

  it("monte au pas suivant quand le précédent ferait plus de dix libellés", () => {
    // 90 s au pas de 10 s : 10 libellés (de 0:00 à 1:30), le maximum.
    expect(toRulerStep(90)).toBe(10);
    // 100 s au pas de 10 s : 11 libellés, trop.
    expect(toRulerStep(100)).toBe(15);
  });

  it("reste à une seconde pour un clip très court, et grandit avec un clip très long", () => {
    expect(toRulerStep(0.4)).toBe(1);
    expect(toRulerStep(0)).toBe(1);
    expect(toRulerStep(3600)).toBe(600);
    expect(toRulerStep(100_000)).toBeGreaterThan(3600);
  });
});

describe("toRulerTimes", () => {
  it("pose une graduation à chaque pas, de zéro jusqu'à la durée", () => {
    expect(toRulerTimes(118.55)).toEqual([0, 15, 30, 45, 60, 75, 90, 105]);
    expect(toRulerTimes(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it("n'a jamais plus de dix graduations, quelle que soit la durée", () => {
    for (const duration of [1, 7, 33, 61, 99, 118.55, 240, 725, 5000]) {
      expect(toRulerTimes(duration).length).toBeLessThanOrEqual(RULER_MAX_LABELS);
    }
  });

  it("garde la graduation de zéro pour un clip sans durée", () => {
    expect(toRulerTimes(0)).toEqual([0]);
  });
});
