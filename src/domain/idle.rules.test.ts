import { describe, expect, it } from "vitest";
import type { IdlePose } from "./head.types";
import {
  IDLE_NEUTRAL,
  IDLE_START,
  type IdleRules,
  type IdleState,
  toIdlePoses,
  toIdleRules,
  toNextIdle,
  toTalkRules,
  toVoicedPose,
} from "./idle.rules";
import type { Settings } from "./settings.schema";

const rules: IdleRules = { min: 2000, max: 5000, angle: 2, lift: 0.005 };
const neutral: IdlePose = { angle: 0, lift: 0 };
const left: IdlePose = { angle: -2, lift: 0 };
const right: IdlePose = { angle: 2, lift: 0 };
const lifted: IdlePose = { angle: 0, lift: 0.005 };

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

const isSame = (a: IdlePose, b: IdlePose) => a.angle === b.angle && a.lift === b.lift;

describe("toIdlePoses", () => {
  it("donne quatre poses : neutre, penchée à gauche, penchée à droite, levée", () => {
    expect(toIdlePoses(rules)).toEqual([neutral, left, right, lifted]);
  });

  it("prend l'angle et la levée des règles", () => {
    expect(toIdlePoses({ ...rules, angle: 1.5, lift: 0.01 })).toEqual([
      { angle: 0, lift: 0 },
      { angle: -1.5, lift: 0 },
      { angle: 1.5, lift: 0 },
      { angle: 0, lift: 0.01 },
    ]);
  });
});

describe("toNextIdle : quand elle parle", () => {
  it("revient à la pose neutre, sans changement prévu, quelle que soit la pose de repos en cours", () => {
    const previous: IdleState = { pose: right, changeAt: 9999 };
    expect(toNextIdle({ previous, isIdle: false, now: 5000, rules, random: seeded(1) })).toEqual(IDLE_START);
  });

  it("garde la tête neutre tant qu'elle parle", () => {
    const next = toNextIdle({ previous: IDLE_START, isIdle: false, now: 5000, rules, random: seeded(1) });
    expect(next).toEqual(IDLE_START);
  });
});

describe("toNextIdle : quand le repos commence", () => {
  it("garde la pose neutre et prévoit le premier changement dans l'intervalle", () => {
    const next = toNextIdle({ previous: IDLE_START, isIdle: true, now: 7000, rules, random: sequence(0.5) });
    expect(next).toEqual({ pose: IDLE_NEUTRAL, changeAt: 10500 });
  });

  it("attend l'intervalle complet : rien ne change tout de suite", () => {
    const first = toNextIdle({ previous: IDLE_START, isIdle: true, now: 7000, rules, random: sequence(0) });
    const second = toNextIdle({ previous: first, isIdle: true, now: 8999, rules, random: seeded(1) });
    expect(second).toBe(first);
  });

  it("repart de zéro après chaque parole : neutre, puis un nouvel intervalle", () => {
    const tilted: IdleState = { pose: left, changeAt: 4000 };
    const spoke = toNextIdle({ previous: tilted, isIdle: false, now: 3000, rules, random: seeded(1) });
    const rested = toNextIdle({ previous: spoke, isIdle: true, now: 3500, rules, random: sequence(0) });
    expect(rested).toEqual({ pose: IDLE_NEUTRAL, changeAt: 5500 });
  });
});

describe("toNextIdle : pendant le repos", () => {
  it("ne change rien avant l'instant prévu, et rend le même état", () => {
    const previous: IdleState = { pose: right, changeAt: 5000 };
    expect(toNextIdle({ previous, isIdle: true, now: 4999, rules, random: seeded(1) })).toBe(previous);
  });

  it("change de pose à l'instant prévu et prévoit le suivant dans l'intervalle", () => {
    const previous: IdleState = { pose: neutral, changeAt: 1000 };
    const next = toNextIdle({ previous, isIdle: true, now: 1000, rules, random: sequence(0, 0.5) });
    expect(next).toEqual({ pose: left, changeAt: 4500 });
  });

  it("change de pose aussi quand l'instant prévu est dépassé, l'intervalle compté depuis maintenant", () => {
    const previous: IdleState = { pose: neutral, changeAt: 1000 };
    const next = toNextIdle({ previous, isIdle: true, now: 1110, rules, random: sequence(0.99, 0) });
    expect(next).toEqual({ pose: lifted, changeAt: 3110 });
  });

  it("tire la pose parmi les autres que la précédente, selon le hasard", () => {
    const previous: IdleState = { pose: left, changeAt: 0 };
    const first = toNextIdle({ previous, isIdle: true, now: 0, rules, random: sequence(0, 0) });
    const last = toNextIdle({ previous, isIdle: true, now: 0, rules, random: sequence(0.99, 0) });
    expect(first.pose).toEqual(neutral);
    expect(last.pose).toEqual(lifted);
  });

  it("borne l'intervalle entre min et max", () => {
    const previous: IdleState = { pose: neutral, changeAt: 0 };
    expect(toNextIdle({ previous, isIdle: true, now: 0, rules, random: sequence(0, 0) }).changeAt).toBe(2000);
    const late = toNextIdle({ previous, isIdle: true, now: 0, rules, random: sequence(0, 0.999999) });
    expect(late.changeAt).toBeLessThan(5000);
  });

  it("ne répète jamais la même pose, les utilise toutes, et change toutes les 2 à 5 s", () => {
    const random = seeded(42);
    let state = toNextIdle({ previous: IDLE_START, isIdle: true, now: 0, rules, random });
    const used: IdlePose[] = [];
    for (let change = 0; change < 5000; change += 1) {
      const now = state.changeAt ?? 0;
      const next = toNextIdle({ previous: state, isIdle: true, now, rules, random });
      expect(isSame(next.pose, state.pose)).toBe(false);
      expect(next.changeAt).toBeGreaterThanOrEqual(now + 2000);
      expect(next.changeAt).toBeLessThan(now + 5000);
      if (!used.some((pose) => isSame(pose, next.pose))) used.push(next.pose);
      state = next;
    }
    expect(used).toHaveLength(4);
  });
});

describe("toIdleRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };
  const idle = { idleMin: 2000, idleMax: 5000, idleAngle: 2, idleLift: 0.005 };

  it("reprend les quatre réglages du repos", () => {
    expect(toIdleRules({ ...base, ...idle })).toEqual(rules);
  });

  it("n'a pas de règles sans réglage : pas d'animation de repos", () => {
    expect(toIdleRules(base)).toBeUndefined();
  });

  it("n'a pas de règles quand un des quatre réglages manque", () => {
    const { idleMin: _min, ...withoutMin } = idle;
    const { idleMax: _max, ...withoutMax } = idle;
    const { idleAngle: _angle, ...withoutAngle } = idle;
    const { idleLift: _lift, ...withoutLift } = idle;
    for (const partial of [withoutMin, withoutMax, withoutAngle, withoutLift]) {
      expect(toIdleRules({ ...base, ...partial })).toBeUndefined();
    }
  });
});

describe("toTalkRules : la tête entière bouge aussi quand elle parle", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };
  const talk = { talkMin: 600, talkMax: 1500, talkAngle: 3, idleLift: 0.005 };

  it("prend l'intervalle et l'angle de la parole, et la levée du repos : les mêmes quatre poses", () => {
    expect(toTalkRules({ ...base, ...talk })).toEqual({ min: 600, max: 1500, angle: 3, lift: 0.005 });
    expect(toIdlePoses(toTalkRules({ ...base, ...talk }) ?? rules)).toEqual([
      neutral,
      { angle: -3, lift: 0 },
      { angle: 3, lift: 0 },
      { angle: 0, lift: 0.005 },
    ]);
  });

  it("n'a pas de règles à 0° : la tête reste neutre en parlant", () => {
    expect(toTalkRules({ ...base, ...talk, talkAngle: 0 })).toBeUndefined();
  });

  it("n'a pas de règles sans réglage de la parole", () => {
    expect(toTalkRules(base)).toBeUndefined();
  });

  it("n'a pas de règles quand l'intervalle ou la levée manque", () => {
    const { talkMin: _min, ...withoutMin } = talk;
    const { talkMax: _max, ...withoutMax } = talk;
    const { idleLift: _lift, ...withoutLift } = talk;
    for (const partial of [withoutMin, withoutMax, withoutLift]) {
      expect(toTalkRules({ ...base, ...partial })).toBeUndefined();
    }
  });
});

describe("toVoicedPose : la voix pousse la tête comme la bouche", () => {
  it("multiplie l'angle et la levée par le facteur de voix", () => {
    expect(toVoicedPose({ angle: 3, lift: 0 }, 2)).toEqual({ angle: 6, lift: 0 });
    expect(toVoicedPose({ angle: 0, lift: 0.005 }, 1.5)).toEqual({ angle: 0, lift: 0.0075 });
    expect(toVoicedPose({ angle: -3, lift: 0 }, 0.5)).toEqual({ angle: -1.5, lift: 0 });
  });

  it("garde la pose neutre neutre, quel que soit le facteur", () => {
    expect(toVoicedPose(neutral, 2)).toEqual(neutral);
  });
});
