import { describe, expect, it } from "vitest";
import { type ScaleCurve, toScale, toScaleCurve } from "./scale.rules";
import type { Settings } from "./settings.schema";

const curve: ScaleCurve = { quietLevel: -40, loudLevel: -10, quietScale: 0.5, loudScale: 1.5 };

describe("toScale", () => {
  it("vaut quietScale au quietLevel et loudScale au loudLevel", () => {
    expect(toScale(-40, curve)).toBeCloseTo(0.5, 9);
    expect(toScale(-10, curve)).toBeCloseTo(1.5, 9);
  });

  it("est linéaire en dB entre les deux", () => {
    expect(toScale(-25, curve)).toBeCloseTo(1, 9);
    expect(toScale(-32.5, curve)).toBeCloseTo(0.75, 9);
    expect(toScale(-17.5, curve)).toBeCloseTo(1.25, 9);
  });

  it("reste à quietScale sous le quietLevel, même sans aucun level", () => {
    expect(toScale(-60, curve)).toBe(0.5);
    expect(toScale(-100, curve)).toBe(0.5);
    expect(toScale(Number.NEGATIVE_INFINITY, curve)).toBe(0.5);
  });

  it("reste à loudScale au-dessus du loudLevel", () => {
    expect(toScale(-5, curve)).toBe(1.5);
    expect(toScale(0, curve)).toBe(1.5);
  });

  it("descend quand loudScale est plus petit que quietScale", () => {
    expect(toScale(-25, { ...curve, quietScale: 1.5, loudScale: 0.5 })).toBeCloseTo(1, 9);
  });

  it("saute de quietScale à loudScale au quietLevel quand loudLevel ne le dépasse pas", () => {
    const flat = { ...curve, loudLevel: -40 };
    expect(toScale(-41, flat)).toBe(0.5);
    expect(toScale(-39, flat)).toBe(1.5);
  });

  it("place la montée où on l'ancre : voix normale vers -20 dB, voix forte vers -10 dB", () => {
    const voice: ScaleCurve = { quietLevel: -25, loudLevel: -10, quietScale: 0.5, loudScale: 1.5 };
    expect(toScale(-25, voice)).toBeCloseTo(0.5, 9);
    expect(toScale(-20, voice)).toBeCloseTo(0.8333333333, 9);
    expect(toScale(-17.5, voice)).toBeCloseTo(1, 9);
    expect(toScale(-10, voice)).toBeCloseTo(1.5, 9);
    expect(toScale(-39, voice)).toBe(0.5);
  });
});

describe("toScaleCurve", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("ancre la courbe sur le quietLevel des settings", () => {
    const settings: Settings = { ...base, quietLevel: -25, quietScale: 0.5, loudScale: 1.5, loudLevel: -10 };
    expect(toScaleCurve(settings)).toEqual({
      quietLevel: -25,
      loudLevel: -10,
      quietScale: 0.5,
      loudScale: 1.5,
    });
  });

  it("ancre la courbe sur le threshold quand il n'y a pas de quietLevel", () => {
    const settings: Settings = { ...base, quietScale: 0.5, loudScale: 1.5, loudLevel: -10 };
    expect(toScaleCurve(settings)).toEqual(curve);
  });

  it("n'a pas de courbe sans réglage : le scale vaut alors 1 partout", () => {
    expect(toScaleCurve(base)).toBeUndefined();
  });

  it("n'a pas de courbe quand un des trois réglages manque", () => {
    expect(toScaleCurve({ ...base, quietScale: 0.5, loudScale: 1.5 })).toBeUndefined();
    expect(toScaleCurve({ ...base, quietScale: 0.5, loudLevel: -10 })).toBeUndefined();
    expect(toScaleCurve({ ...base, loudScale: 1.5, loudLevel: -10 })).toBeUndefined();
    expect(toScaleCurve({ ...base, quietLevel: -25 })).toBeUndefined();
  });
});

describe("toScaleCurve : l'effet de la voix", () => {
  // quietScale et loudScale sont les extrêmes, atteints à 100 % : voix douce ×0,3, voix forte ×2.
  const extremes: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
    quietLevel: -25,
    loudLevel: -10,
    quietScale: 0.3,
    loudScale: 2,
  };

  it("sans effet donné, applique les extrêmes tels quels", () => {
    expect(toScaleCurve(extremes)).toEqual({
      quietLevel: -25,
      loudLevel: -10,
      quietScale: 0.3,
      loudScale: 2,
    });
  });

  it("à 100 %, donne ×0,3 à voix douce et ×2 à voix forte", () => {
    const curve = toScaleCurve({ ...extremes, voiceEffect: 1 });
    expect(curve?.quietScale).toBeCloseTo(0.3, 9);
    expect(curve?.loudScale).toBeCloseTo(2, 9);
  });

  it("à 0 %, ne change rien : le facteur vaut 1 à tous les niveaux", () => {
    const curve = toScaleCurve({ ...extremes, voiceEffect: 0 });
    expect(curve).toEqual({ quietLevel: -25, loudLevel: -10, quietScale: 1, loudScale: 1 });
    if (!curve) throw new Error("la courbe devrait exister");
    for (const level of [-100, -40, -25, -17, -10, 0]) expect(toScale(level, curve)).toBe(1);
  });

  it("entre les deux, est linéaire : voix douce = 1 - 0,7 × effet, voix forte = 1 + effet", () => {
    for (const effect of [0.1, 0.3, 0.5, 0.8]) {
      const curve = toScaleCurve({ ...extremes, voiceEffect: effect });
      expect(curve?.quietScale).toBeCloseTo(1 - 0.7 * effect, 9);
      expect(curve?.loudScale).toBeCloseTo(1 + effect, 9);
    }
  });

  it("garde les niveaux : l'effet ne déplace pas où la voix est douce ou forte", () => {
    const curve = toScaleCurve({ ...extremes, voiceEffect: 0.5 });
    expect(curve?.quietLevel).toBe(-25);
    expect(curve?.loudLevel).toBe(-10);
  });

  it("n'invente pas de courbe sans extrêmes : l'effet seul ne fait rien", () => {
    const { quietScale: _quiet, loudScale: _loud, loudLevel: _level, ...bare } = extremes;
    expect(toScaleCurve({ ...bare, voiceEffect: 1 })).toBeUndefined();
  });
});
