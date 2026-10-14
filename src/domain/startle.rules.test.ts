import { describe, expect, it } from "vitest";
import type { Settings } from "./settings.schema";
import { isSpike, type Sample, type StartleRules, toRecentSamples, toStartleRules } from "./startle.rules";

const rules: StartleRules = { rise: 20, within: 300, level: -15, gap: 30_000 };

describe("toStartleRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend la hausse, le temps, le level et l'écart des réglages", () => {
    expect(
      toStartleRules({
        ...base,
        foxStartleRise: 20,
        foxStartleWithin: 300,
        foxStartleLevel: -15,
        foxStartleGap: 30_000,
      }),
    ).toEqual(rules);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toStartleRules(base)).toBeUndefined();
  });
});

describe("toRecentSamples : les mesures de moins de 300 ms", () => {
  const samples: Sample[] = [
    { at: 1000, level: -50 },
    { at: 1100, level: -45 },
    { at: 1250, level: -40 },
    { at: 1300, level: -38 },
  ];

  it("garde celles qui datent de moins de 300 ms, et laisse les autres", () => {
    expect(toRecentSamples(samples, 1400, 300)).toEqual([
      { at: 1250, level: -40 },
      { at: 1300, level: -38 },
    ]);
  });

  it("laisse tomber une mesure qui date de 300 ms pile", () => {
    expect(toRecentSamples(samples, 1400, 300).map(({ at }) => at)).not.toContain(1100);
    expect(toRecentSamples(samples, 1400, 300)).toHaveLength(2);
  });

  it("ne garde rien quand tout est ancien", () => {
    expect(toRecentSamples(samples, 5000, 300)).toEqual([]);
  });
});

describe("isSpike : 20 dB en moins de 300 ms, jusqu'au-dessus de -15 dB", () => {
  const quiet: Sample[] = [
    { at: 1000, level: -40 },
    { at: 1050, level: -42 },
    { at: 1100, level: -38 },
  ];

  it("est un spike quand le level monte d'au moins 20 dB depuis le plus bas récent, au-dessus de -15 dB", () => {
    expect(isSpike(quiet, -10, rules)).toBe(true);
  });

  it("l'est pile à 20 dB de hausse : au moins, pas plus de", () => {
    expect(isSpike([{ at: 1000, level: -34.5 }], -14.5, rules)).toBe(true);
    expect(isSpike([{ at: 1000, level: -34.4 }], -14.5, rules)).toBe(false);
  });

  it("ne l'est pas sous 20 dB de hausse, même au-dessus de -15 dB", () => {
    expect(isSpike([{ at: 1000, level: -20 }], -10, rules)).toBe(false);
    expect(isSpike([{ at: 1000, level: -25 }], -10, rules)).toBe(false);
  });

  it("ne l'est pas tant que le level n'est pas au-dessus de -15 dB, pile compris", () => {
    expect(isSpike([{ at: 1000, level: -80 }], -15, rules)).toBe(false);
    expect(isSpike([{ at: 1000, level: -80 }], -20, rules)).toBe(false);
  });

  it("ne l'est pas sans mesure récente : rien ne dit d'où il monte", () => {
    expect(isSpike([], -5, rules)).toBe(false);
  });

  it("compare au plus bas des mesures récentes, pas à la dernière", () => {
    const samples: Sample[] = [
      { at: 1000, level: -60 },
      { at: 1050, level: -20 },
    ];
    expect(isSpike(samples, -10, rules)).toBe(true);
  });

  it("suit les réglages : une hausse plus faible, un level plus bas", () => {
    const sensitive: StartleRules = { ...rules, rise: 10, level: -30 };
    expect(isSpike([{ at: 1000, level: -45 }], -28, sensitive)).toBe(true);
    expect(isSpike([{ at: 1000, level: -45 }], -28, rules)).toBe(false);
  });
});
