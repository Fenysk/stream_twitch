import { describe, expect, it } from "vitest";
import { toFoxTransform } from "./fox-transform.rules";

describe("toFoxTransform", () => {
  it("ne déplace rien au repos : on va au centre et on en revient, sans tourner", () => {
    expect(toFoxTransform({ offset: 0, angle: 0, scaleX: 1, scaleY: 1 })).toBe(
      "translateY(-50%) rotate(0deg) translateY(50%) scale(1, 1)",
    );
  });

  it("descend de la fraction de la toile demandée", () => {
    expect(toFoxTransform({ offset: 1.05, angle: 0, scaleX: 1, scaleY: 1 })).toBe(
      "translateY(55%) rotate(0deg) translateY(50%) scale(1, 1)",
    );
    expect(toFoxTransform({ offset: -0.09, angle: 0, scaleX: 1, scaleY: 1 })).toBe(
      "translateY(-59%) rotate(0deg) translateY(50%) scale(1, 1)",
    );
  });

  it("tourne autour du centre et met le corps à l'échelle", () => {
    expect(toFoxTransform({ offset: 0.5, angle: 180, scaleX: 0.9, scaleY: 1.1 })).toBe(
      "translateY(0%) rotate(180deg) translateY(50%) scale(0.9, 1.1)",
    );
  });
});
