import { describe, expect, it } from "vitest";
import type { Settings } from "./settings.schema";
import {
  isShoutContinued,
  isShoutPainful,
  type Shout,
  type ShoutRules,
  toRecentStarts,
  toShoutLength,
  toShoutRules,
} from "./shout.rules";

const rules: ShoutRules = { threshold: -5, merge: 1000, count: 3, period: 120_000, long: 3000, gap: 600_000 };
const shout: Shout = { startedAt: 10_000, lastLoudAt: 10_500, isCounted: true };

describe("toShoutRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend les réglages du cri", () => {
    expect(
      toShoutRules({
        ...base,
        foxShoutThreshold: -5,
        foxShoutMerge: 1000,
        foxShoutCount: 3,
        foxShoutPeriod: 120_000,
        foxShoutLong: 3000,
        foxShoutGap: 600_000,
      }),
    ).toEqual(rules);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toShoutRules(base)).toBeUndefined();
  });
});

describe("isShoutContinued : deux passages à moins d'1 s d'écart font un seul cri", () => {
  it("prolonge le cri quand le dernier passage date de moins d'1 s", () => {
    expect(isShoutContinued(shout, 11_499, 1000)).toBe(true);
  });

  it("ouvre un autre cri à 1 s pile d'écart", () => {
    expect(isShoutContinued(shout, 11_500, 1000)).toBe(false);
  });

  it("n'a rien à prolonger quand aucun cri n'est en cours", () => {
    expect(isShoutContinued(null, 11_000, 1000)).toBe(false);
  });
});

describe("toShoutLength", () => {
  it("compte du début au dernier passage", () => {
    expect(toShoutLength({ ...shout, lastLoudAt: 14_200 })).toBe(4200);
    expect(toShoutLength({ ...shout, lastLoudAt: shout.startedAt })).toBe(0);
  });
});

describe("toRecentStarts", () => {
  it("garde les débuts de cri des 2 dernières minutes, et laisse les plus vieux", () => {
    expect(toRecentStarts([1000, 50_000, 121_000, 200_000], 201_000, 120_000)).toEqual([121_000, 200_000]);
  });

  it("laisse tomber un début qui date de la période exacte", () => {
    expect(toRecentStarts([80_000], 200_000, 120_000)).toEqual([]);
  });
});

describe("isShoutPainful : 3 cris en 2 min, ou un cri de plus de 3 s", () => {
  it("l'est au troisième cri de la période, pas au deuxième", () => {
    expect(isShoutPainful(2, shout, rules)).toBe(false);
    expect(isShoutPainful(3, shout, rules)).toBe(true);
  });

  it("l'est quand le cri dure plus de 3 s, pas à 3 s pile", () => {
    expect(isShoutPainful(1, { ...shout, lastLoudAt: shout.startedAt + 3000 }, rules)).toBe(false);
    expect(isShoutPainful(1, { ...shout, lastLoudAt: shout.startedAt + 3001 }, rules)).toBe(true);
  });

  it("suit les réglages : 2 cris suffisent, un cri de 1 s suffit", () => {
    const quick: ShoutRules = { ...rules, count: 2, long: 1000 };
    expect(isShoutPainful(2, shout, quick)).toBe(true);
    expect(isShoutPainful(1, { ...shout, lastLoudAt: shout.startedAt + 1001 }, quick)).toBe(true);
  });
});
