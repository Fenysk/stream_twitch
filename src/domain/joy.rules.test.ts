import { describe, expect, it } from "vitest";
import { JOY_CROUCH, JOY_HEIGHT, JOY_IMPACT, JOY_STRETCH, toJoyBody } from "./joy.rules";

const JOY_MS = 800;
const frames = Array.from({ length: 81 }, (_, index) => toJoyBody(index * 10, JOY_MS));

describe("toJoyBody : le saut de joie", () => {
  it("part de sa place, à sa taille, et y revient", () => {
    expect(toJoyBody(0, JOY_MS)).toEqual({ offset: 0, squashX: 1, squashY: 1 });
    expect(toJoyBody(JOY_MS, JOY_MS)).toEqual({ offset: 0, squashX: 1, squashY: 1 });
    expect(toJoyBody(5000, JOY_MS)).toEqual({ offset: 0, squashX: 1, squashY: 1 });
  });

  it("s'écrase d'abord pour prendre son élan : plus bas, plus large, sans quitter sa place", () => {
    const crouched = toJoyBody(JOY_MS * 0.2 - 1, JOY_MS);
    expect(crouched.squashY).toBeCloseTo(1 - JOY_CROUCH, 1);
    expect(crouched.squashX).toBeGreaterThan(1.05);
    expect(crouched.offset).toBe(0);
  });

  it("saute au-dessus de sa place sans dépasser 9 % de la toile (la marge au-dessus de lui)", () => {
    const offsets = frames.map(({ offset }) => offset);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-JOY_HEIGHT - 1e-9);
    expect(Math.min(...offsets)).toBeLessThan(-0.085);
    expect(Math.max(...offsets)).toBe(0);
  });

  it("monte puis redescend : un seul sommet, au milieu du vol", () => {
    const offsets = frames.map(({ offset }) => offset);
    const peak = offsets.indexOf(Math.min(...offsets));
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThan(50);
    for (let index = 17; index < peak; index += 1)
      expect(offsets[index + 1]).toBeLessThanOrEqual(offsets[index] ?? 0);
    for (let index = peak; index < 59; index += 1)
      expect(offsets[index + 1]).toBeGreaterThanOrEqual(offsets[index] ?? 0);
  });

  it("s'étire au décollage, puis s'écrase sous le choc en arrivant avant de se redresser", () => {
    const stretches = frames.map(({ squashY }) => squashY - 1);
    expect(Math.max(...stretches)).toBeCloseTo(JOY_STRETCH, 1);
    const landing = frames.slice(Math.floor(0.75 * 80)).map(({ squashY }) => squashY - 1);
    expect(Math.min(...landing)).toBeCloseTo(-JOY_IMPACT, 1);
    expect(landing.at(-1)).toBeCloseTo(0, 1);
  });

  it("enchaîne sans à-coup : jamais plus de 3 % de la toile ni 7 % d'écrasement en 10 ms", () => {
    for (const [index, frame] of frames.entries()) {
      const previous = frames[index - 1];
      if (!previous) continue;
      expect(Math.abs(frame.offset - previous.offset)).toBeLessThan(0.03);
      expect(Math.abs(frame.squashY - previous.squashY)).toBeLessThan(0.07);
    }
  });

  it("suit la durée réglée : un saut plus court a son sommet plus tôt", () => {
    expect(toJoyBody(200, 400).offset).toBeLessThan(-0.05);
    expect(toJoyBody(200, 1600).offset).toBe(0);
  });
});
