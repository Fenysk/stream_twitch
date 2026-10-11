import { describe, expect, it } from "vitest";
import { toLevel } from "./mic.rules";

describe("toLevel", () => {
  it("convertit un pic linéaire en dB : 1 vaut 0 dB, 0.1 vaut -20 dB, 0.01 vaut -40 dB", () => {
    expect(toLevel([1])).toBeCloseTo(0, 6);
    expect(toLevel([0.1])).toBeCloseTo(-20, 6);
    expect(toLevel([0.01])).toBeCloseTo(-40, 6);
  });

  it("garde le pic le plus fort parmi les canaux", () => {
    expect(toLevel([0.01, 0.1, 0.001])).toBeCloseTo(-20, 6);
  });

  it("s'arrête à -100 dB pour le silence, un pic minuscule ou aucun canal", () => {
    expect(toLevel([0])).toBe(-100);
    expect(toLevel([1e-9])).toBe(-100);
    expect(toLevel([])).toBe(-100);
  });
});
