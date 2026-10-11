import { describe, expect, it } from "vitest";
import type { Mouth, Pose } from "./head.types";
import { isLoud, type MouthRules, toNextMouth } from "./mouth.rules";

const poseA: Pose = { pivot: "right", angle: 7 };
const poseB: Pose = { pivot: "left", angle: -14 };
const poseC: Pose = { pivot: "center", angle: 3, lift: 0.11 };
const rules: MouthRules = { poses: [poseA, poseB, poseC], closedChance: 0.22, delay: 250 };

const closed: Mouth = { kind: "closed" };
const openWith = (pose: Pose): Mouth => ({ kind: "open", pose });

// Hasard déterministe (mulberry32) : les statistiques des tests ne changent jamais d'une exécution à l'autre.
const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const sequence = (...values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

// Quand elle parle, 5 ms après le dernier level fort.
const talking = { lastLoudAt: 1000, now: 1005 };

describe("isLoud", () => {
  it("est vrai quand le level dépasse le threshold", () => {
    expect(isLoud(-30, -40)).toBe(true);
  });

  it("est faux à égalité et en dessous du threshold", () => {
    expect(isLoud(-40, -40)).toBe(false);
    expect(isLoud(-60, -40)).toBe(false);
  });
});

describe("toNextMouth : quand elle ne parle pas", () => {
  it("ferme la bouche si le level n'a jamais dépassé le threshold", () => {
    const next = toNextMouth({
      previous: openWith(poseA),
      lastLoudAt: null,
      now: 5000,
      rules,
      random: seeded(1),
    });
    expect(next).toEqual(closed);
  });

  it("ferme la bouche quand le dernier level fort date d'au moins le delay", () => {
    const next = toNextMouth({
      previous: openWith(poseA),
      lastLoudAt: 1000,
      now: 1250,
      rules,
      random: seeded(1),
    });
    expect(next).toEqual(closed);
  });

  it("garde la bouche fermée si elle l'était", () => {
    const next = toNextMouth({ previous: closed, lastLoudAt: 1000, now: 9000, rules, random: seeded(1) });
    expect(next).toEqual(closed);
  });
});

describe("toNextMouth : quand elle parle", () => {
  it("parle encore 1 ms avant la fin du delay", () => {
    const next = toNextMouth({ previous: closed, lastLoudAt: 1000, now: 1249, rules, random: seeded(1) });
    expect(next.kind).toBe("open");
  });

  it("ouvre toujours la bouche depuis fermée, même si le hasard tomberait sous closedChance", () => {
    const next = toNextMouth({ previous: closed, ...talking, rules, random: () => 0 });
    expect(next.kind).toBe("open");
  });

  it("ferme la bouche quand le hasard tombe sous closedChance", () => {
    const next = toNextMouth({ previous: openWith(poseA), ...talking, rules, random: sequence(0.21) });
    expect(next).toEqual(closed);
  });

  it("change de pose quand le hasard atteint closedChance", () => {
    const next = toNextMouth({ previous: openWith(poseA), ...talking, rules, random: sequence(0.22, 0) });
    expect(next).toEqual(openWith(poseB));
  });

  it("tire la pose parmi les autres que la précédente, selon le hasard", () => {
    const first = toNextMouth({ previous: openWith(poseA), ...talking, rules, random: sequence(0.5, 0) });
    const last = toNextMouth({ previous: openWith(poseA), ...talking, rules, random: sequence(0.5, 0.99) });
    expect(first).toEqual(openWith(poseB));
    expect(last).toEqual(openWith(poseC));
  });

  it("tire une pose parmi toutes depuis fermée, avec un seul tirage", () => {
    const next = toNextMouth({ previous: closed, ...talking, rules, random: sequence(0.99) });
    expect(next).toEqual(openWith(poseC));
  });

  it("ne répète jamais la même pose, ne ferme jamais deux fois de suite, et les utilise toutes", () => {
    const random = seeded(42);
    let mouth: Mouth = closed;
    const used = new Set<Pose>();
    for (let tick = 0; tick < 5000; tick += 1) {
      const next = toNextMouth({ previous: mouth, ...talking, rules, random });
      if (mouth.kind === "closed") expect(next.kind).toBe("open");
      if (mouth.kind === "open" && next.kind === "open") expect(next.pose).not.toBe(mouth.pose);
      if (next.kind === "open") used.add(next.pose);
      mouth = next;
    }
    expect(used.size).toBe(rules.poses.length);
  });

  it("ferme la bouche avec la probabilité closedChance quand elle était ouverte", () => {
    const random = seeded(7);
    let mouth: Mouth = openWith(poseA);
    let fromOpen = 0;
    let closings = 0;
    for (let tick = 0; tick < 20000; tick += 1) {
      const next = toNextMouth({ previous: mouth, ...talking, rules, random });
      if (mouth.kind === "open") {
        fromOpen += 1;
        if (next.kind === "closed") closings += 1;
      }
      mouth = next;
    }
    expect(closings / fromOpen).toBeCloseTo(0.22, 1);
    expect(Math.abs(closings / fromOpen - 0.22)).toBeLessThan(0.015);
  });

  it("ne ferme jamais la bouche en parlant quand closedChance vaut 0", () => {
    const random = seeded(3);
    let mouth: Mouth = closed;
    for (let tick = 0; tick < 2000; tick += 1) {
      mouth = toNextMouth({ previous: mouth, ...talking, rules: { ...rules, closedChance: 0 }, random });
      expect(mouth.kind).toBe("open");
    }
  });

  it("ferme la bouche à chaque fois qu'elle était ouverte quand closedChance vaut 1", () => {
    const next = toNextMouth({
      previous: openWith(poseA),
      ...talking,
      rules: { ...rules, closedChance: 1 },
      random: sequence(0.999),
    });
    expect(next).toEqual(closed);
  });
});
