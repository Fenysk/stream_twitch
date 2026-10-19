import { describe, expect, it } from "vitest";
import {
  BOOST_MAX_DB,
  BOOST_MIN_DB,
  BOOST_STEP_MAX_DB,
  TALK_FLOOR_DB,
  TALK_MIN_READINGS,
  toBoost,
  toNextBoost,
  toTalkPeak,
} from "./boost.rules";

const TARGET = -17;

// Des lectures de voix : `count` lectures qui montent de `low` à `high` dB.
const talk = (low: number, high: number, count = 40): number[] =>
  Array.from({ length: count }, (_, index) => low + ((high - low) * index) / (count - 1));

describe("toBoost", () => {
  it("garde un boost de 0 à 30 dB, au dixième de dB près", () => {
    expect(toBoost(7)).toBe(7);
    expect(toBoost(7.46)).toBe(7.5);
    expect(toBoost(0)).toBe(0);
    expect(toBoost(20)).toBe(20);
    expect(toBoost(30)).toBe(30);
  });

  it("ne descend jamais sous 0 dB ni ne monte au-dessus de 30 dB", () => {
    expect(toBoost(-3)).toBe(BOOST_MIN_DB);
    expect(toBoost(-0.04)).toBe(0);
    expect(toBoost(34)).toBe(BOOST_MAX_DB);
    expect(toBoost(24)).toBe(24);
  });
});

describe("toTalkPeak", () => {
  it("rend les crêtes de la voix : le level que 90 % des lectures de voix ne dépassent pas", () => {
    const peak = toTalkPeak(talk(-30, -20, 41));
    expect(peak).toBeCloseTo(-21, 5);
  });

  it("ne tient pas compte des silences ni du bruit de fond sous le plancher de -55 dB", () => {
    const silence = Array.from({ length: 200 }, () => -80);
    const noise = Array.from({ length: 200 }, () => TALK_FLOOR_DB - 0.1);
    const voice = talk(-30, -20, 41);
    expect(toTalkPeak([...silence, ...noise, ...voice])).toBe(toTalkPeak(voice));
  });

  it("juge le plancher avant le boost : une voix à -50 dB brut compte sous 10 dB de boost, et le bruit de fond remonté avec elle ne compte pas", () => {
    const voice = Array.from({ length: 40 }, () => -50 + 10);
    const noise = Array.from({ length: 400 }, () => -60 + 10);
    expect(toTalkPeak([...voice, ...noise], 10)).toBe(-40);
    expect(toTalkPeak(noise, 10)).toBeNull();
    expect(toTalkPeak(voice)).toBe(-40);
    expect(toTalkPeak(noise)).toBe(-50);
  });

  it("compte une lecture pile au plancher comme de la voix", () => {
    const readings = Array.from({ length: TALK_MIN_READINGS }, () => TALK_FLOOR_DB);
    expect(toTalkPeak(readings)).toBe(TALK_FLOOR_DB);
  });

  it("ne juge pas sur moins d'une seconde de voix, quel que soit son level", () => {
    expect(toTalkPeak(talk(-20, -10, TALK_MIN_READINGS - 1))).toBeNull();
    expect(toTalkPeak([])).toBeNull();
    expect(toTalkPeak(Array.from({ length: 500 }, () => -90))).toBeNull();
  });

  it("n'est pas tirée par une seule lecture trop forte (un claquement)", () => {
    const voice = talk(-30, -22, 100);
    expect(toTalkPeak([...voice, -1])).toBeLessThan(-21);
  });

  it("ne dépend pas de l'ordre des lectures, et ne change pas la liste reçue", () => {
    const voice = talk(-30, -20, 41);
    const reversed = [...voice].reverse();
    expect(toTalkPeak(reversed)).toBe(toTalkPeak(voice));
    expect(reversed[0]).toBe(voice.at(-1));
  });
});

describe("toNextBoost : la correction", () => {
  it("monte d'un cran quand la voix est sous la cible, de la moitié de ce qui manque au plus 6 dB", () => {
    expect(toNextBoost(0, -37, TARGET)).toBe(BOOST_STEP_MAX_DB);
    expect(toNextBoost(0, -27, TARGET)).toBe(5);
    expect(toNextBoost(0, -21, TARGET)).toBe(2);
    expect(toNextBoost(4, -19, TARGET)).toBe(5);
  });

  it("monte progressivement, jamais d'un saut : une voix à -27 dB atteint la cible en quelques crans qui se resserrent", () => {
    const steps: number[] = [];
    let boost = 0;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const peak = -27 + boost;
      const next = toNextBoost(boost, peak, TARGET);
      if (next === boost) break;
      expect(next - boost).toBeLessThanOrEqual(BOOST_STEP_MAX_DB);
      steps.push(next);
      boost = next;
    }
    expect(steps).toEqual([5, 7.5, 8.8]);
    expect(-27 + boost).toBeGreaterThanOrEqual(TARGET - 1.5);
    expect(-27 + boost).toBeLessThanOrEqual(TARGET);
  });

  it("ne corrige pas un écart de 1,5 dB ou moins", () => {
    expect(toNextBoost(5, -18.5, TARGET)).toBe(5);
    expect(toNextBoost(5, -17.5, TARGET)).toBe(5);
    expect(toNextBoost(5, -18.6, TARGET)).toBeGreaterThan(5);
  });

  it("monte vite d'une voix très faible, par crans de 6 dB, et s'arrête près de la cible", () => {
    const steps: number[] = [];
    let boost = 0;
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const next = toNextBoost(boost, -47 + boost, TARGET);
      if (next === boost) break;
      steps.push(next);
      boost = next;
    }
    expect(steps).toEqual([6, 12, 18, 24, 27, 28.5]);
  });

  it("ne dépasse jamais +30 dB, même avec une voix très faible", () => {
    expect(toNextBoost(27, -44, TARGET)).toBe(BOOST_MAX_DB);
    expect(toNextBoost(30, -44, TARGET)).toBe(BOOST_MAX_DB);
    expect(toNextBoost(20, -44, TARGET)).toBe(26);
  });

  it("ne baisse jamais la voix : au-dessus de la cible le boost reste, et il ne descend pas sous 0 dB", () => {
    expect(toNextBoost(8, -10, TARGET)).toBe(8);
    expect(toNextBoost(0, -5, TARGET)).toBe(0);
    expect(toNextBoost(-4, -5, TARGET)).toBe(BOOST_MIN_DB);
  });

  it("rend un boost au dixième de dB près", () => {
    const next = toNextBoost(0, -24.4, TARGET);
    expect(next).toBe(3.7);
    expect(toNextBoost(0, -20.4, TARGET)).toBe(1.7);
  });
});
