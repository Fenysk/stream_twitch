import { describe, expect, it } from "vitest";
import {
  BLINK_IMAGE,
  FOX_START,
  type FoxState,
  LISTEN_IMAGES,
  toFoxDisplay,
  toNextFox,
  WAVE_PERIOD_MS,
  YAWN_IMAGE,
} from "./fox.rules";
import type { FoxMode, FoxRules } from "./fox.schema";
import { FLINCH_MODE, LISTENING_MODE, RAID_MODE, STARTLE_MODE, WAVE_MODE, YAWN_MODE } from "./fox-mode.rules";

const rules: FoxRules = {
  smallThreshold: -38,
  mediumThreshold: -26,
  largeChance: 0.3,
  bounce: 0.04,
  breathPeriod: 4000,
  breath: 0.015,
  gazeMin: 5000,
  gazeMax: 15000,
  blinkMin: 3000,
  blinkMax: 6000,
  blinkDuration: 150,
  listenMin: 2000,
  listenMax: 4000,
  joyMs: 800,
  crouchMs: 300,
  jumpMs: 400,
  diveMs: 800,
  returnMs: 800,
};

// Hasard déterministe (mulberry32).
const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const constant = (value: number) => () => value;

const smile: FoxMode = { kind: "reaction", image: "front-smile-rest" };

type Pose = { now: number; state: FoxState; image: string };

// Fait avancer le renard par pas de 16 ms avec ce mode et ce level, et note l'image de chaque pas.
const run = (
  start: FoxState,
  from: number,
  to: number,
  mode: FoxMode | ((now: number) => FoxMode),
  random: () => number,
  level: number | null = null,
): { state: FoxState; frames: Pose[] } => {
  let state = start;
  const frames: Pose[] = [];
  for (let now = from; now < to; now += 16) {
    state = toNextFox({
      previous: state,
      now,
      level,
      rules,
      random,
      mode: typeof mode === "function" ? mode(now) : mode,
    });
    frames.push({ now, state, image: toFoxDisplay(state, now, rules).image });
  }
  return { state, frames };
};

describe("D : il écoute Alexis (mode listening)", () => {
  it("ne regarde jamais à gauche pendant toute l'écoute, même après plusieurs minutes", () => {
    const { frames } = run(FOX_START, 0, 300_000, LISTENING_MODE, seeded(3));
    for (const { image } of frames) expect(image.startsWith("left-")).toBe(false);
  });

  it("alterne entre face et droite, et ne montre que ces deux regards (et le clignement)", () => {
    const { frames } = run(FOX_START, 0, 120_000, LISTENING_MODE, seeded(5));
    const seen = new Set(frames.map(({ image }) => image));
    expect([...seen].sort()).toEqual([BLINK_IMAGE, ...LISTEN_IMAGES].sort());
  });

  it("change de regard toutes les 2 à 4 s", () => {
    const { frames } = run(FOX_START, 0, 300_000, LISTENING_MODE, seeded(7));
    const changes = frames.filter(
      ({ state }, index) => index > 0 && state.gaze !== frames[index - 1]?.state.gaze,
    );
    expect(changes.length).toBeGreaterThan(60);
    changes.forEach((change, index) => {
      const previous = changes[index - 1];
      if (!previous) return;
      expect(change.now - previous.now).toBeGreaterThanOrEqual(2000 - 16);
      expect(change.now - previous.now).toBeLessThanOrEqual(4000 + 16);
    });
  });

  it("ne reprend jamais le même regard deux fois de suite", () => {
    const { frames } = run(FOX_START, 0, 120_000, LISTENING_MODE, seeded(9));
    const gazes = frames
      .map(({ state }) => state.gaze)
      .filter((gaze, index, all) => index === 0 || gaze !== all[index - 1]);
    for (const [index, gaze] of gazes.entries()) expect(gaze).not.toBe(gazes[index - 1]);
  });

  it("se tourne tout de suite vers la face s'il regardait à gauche quand Alexis se met à parler", () => {
    const looking: FoxState = { ...FOX_START, gaze: "left-closed-rest" };
    const state = toNextFox({
      previous: looking,
      now: 1000,
      level: null,
      rules,
      random: constant(0.5),
      mode: LISTENING_MODE,
    });
    expect(state.gaze).toBe("front-closed-rest");
    expect(toFoxDisplay(state, 1000, rules).image).toBe("front-closed-rest");
  });

  it("cligne toujours : les yeux se ferment 150 ms comme au repos", () => {
    const { frames } = run(FOX_START, 0, 60_000, LISTENING_MODE, seeded(11));
    const shut = frames.filter(({ image }) => image === BLINK_IMAGE);
    expect(shut.length).toBeGreaterThan(30);
  });

  it("revient au repos quand il se tait : le regard reprend ses trois directions et son intervalle", () => {
    const { frames } = run(
      FOX_START,
      0,
      600_000,
      (now) => (now < 10_000 ? LISTENING_MODE : { kind: "idle" }),
      seeded(13),
    );
    const afterListening = frames.filter(({ now }) => now >= 10_000);
    const gazes = new Set(afterListening.map(({ state }) => state.gaze));
    expect(gazes.size).toBe(3);
    const changes = afterListening.filter(
      ({ state }, index) => index > 0 && state.gaze !== afterListening[index - 1]?.state.gaze,
    );
    changes.slice(1).forEach((change, index) => {
      const previous = changes[index];
      if (previous) expect(change.now - previous.now).toBeGreaterThanOrEqual(5000 - 16);
    });
  });

  it("parle avec la bouche (à gauche) quand il lit pendant que le mode est encore l'écoute", () => {
    const state = toNextFox({
      previous: FOX_START,
      now: 100,
      level: -15,
      rules,
      random: constant(0.5),
      mode: LISTENING_MODE,
    });
    expect(toFoxDisplay(state, 100, rules).image.startsWith("left-")).toBe(true);
    expect(state.isListening).toBe(false);
  });
});

describe("E : la réaction (mode reaction)", () => {
  it("montre l'image de la réaction, quel que soit le regard, sans cligner", () => {
    const { frames } = run(FOX_START, 0, 10_000, smile, seeded(1));
    for (const { image } of frames) expect(image).toBe("front-smile-rest");
  });

  it.each(["front-smile-rest", "left-large-rest", "wink-tongue-rest"] as const)("montre %s", (image) => {
    const state = toNextFox({
      previous: FOX_START,
      now: 0,
      level: null,
      rules,
      random: constant(0.5),
      mode: { kind: "reaction", image },
    });
    expect(toFoxDisplay(state, 0, rules).image).toBe(image);
  });

  it("reprend le regard et un intervalle entier après la réaction", () => {
    const { frames } = run(FOX_START, 0, 20_000, (now) => (now < 1000 ? smile : { kind: "idle" }), seeded(2));
    const after = frames.filter(({ now }) => now >= 1000);
    expect(after[0]?.image).toBe("front-closed-rest");
    expect(after[0]?.state.gazeAt).toBeGreaterThanOrEqual(1000 + 5000);
    expect(after[0]?.state.blinkAt).toBeGreaterThanOrEqual(1000 + 3000);
  });

  it("laisse la bouche gagner : la voix qui part pendant la réaction montre la bouche", () => {
    const state = toNextFox({
      previous: FOX_START,
      now: 0,
      level: -15,
      rules,
      random: constant(0.5),
      mode: smile,
    });
    expect(toFoxDisplay(state, 0, rules).image.startsWith("left-")).toBe(true);
  });
});

describe("G : le coucou (mode wave)", () => {
  it("alterne front-smile-wave et front-small-wave toutes les 250 ms, en commençant par front-smile-wave", () => {
    const { frames } = run(FOX_START, 5000, 6000, WAVE_MODE, constant(0.5));
    expect(frames[0]?.image).toBe("front-smile-wave");
    const at = (ms: number) => frames.find(({ now }) => now >= 5000 + ms)?.image;
    expect(at(0)).toBe("front-smile-wave");
    expect(at(WAVE_PERIOD_MS)).toBe("front-small-wave");
    expect(at(WAVE_PERIOD_MS * 2)).toBe("front-smile-wave");
    expect(at(WAVE_PERIOD_MS * 3)).toBe("front-small-wave");
  });

  it("ne montre que les deux images du coucou, sans cligner", () => {
    const { frames } = run(FOX_START, 0, 1000, WAVE_MODE, seeded(4));
    expect(new Set(frames.map(({ image }) => image))).toEqual(
      new Set(["front-smile-wave", "front-small-wave"]),
    );
  });

  it("recommence par front-smile-wave à chaque nouveau coucou", () => {
    const first = run(FOX_START, 0, 600, WAVE_MODE, constant(0.5));
    const idle = run(first.state, 600, 700, { kind: "idle" }, constant(0.5));
    const second = run(idle.state, 700, 800, WAVE_MODE, constant(0.5));
    expect(second.frames[0]?.image).toBe("front-smile-wave");
  });
});

describe("le long coucou d'un raid (mode raid)", () => {
  it("alterne les images du coucou toutes les 250 ms, en commençant par front-smile-wave, sans cligner", () => {
    const { frames } = run(FOX_START, 5000, 8000, RAID_MODE, seeded(4));
    const at = (ms: number) => frames.find(({ now }) => now >= 5000 + ms)?.image;
    expect(at(0)).toBe("front-smile-wave");
    expect(at(WAVE_PERIOD_MS)).toBe("front-small-wave");
    expect(at(WAVE_PERIOD_MS * 2)).toBe("front-smile-wave");
    expect(new Set(frames.map(({ image }) => image))).toEqual(
      new Set(["front-smile-wave", "front-small-wave"]),
    );
  });

  it("repart de front-smile-wave quand un raid suit un coucou", () => {
    const wave = run(FOX_START, 0, 300, WAVE_MODE, constant(0.5));
    const raid = run(wave.state, 300, 400, RAID_MODE, constant(0.5));
    expect(raid.frames[0]?.image).toBe("front-smile-wave");
  });
});

describe("F : le bâillement (mode yawn)", () => {
  it("montre shut-yawn-cover tant que le mode dure, sans cligner", () => {
    const { frames } = run(FOX_START, 0, 5000, YAWN_MODE, seeded(6));
    for (const { image } of frames) expect(image).toBe(YAWN_IMAGE);
  });

  it("revient au regard après le bâillement", () => {
    const { frames } = run(
      FOX_START,
      0,
      4000,
      (now) => (now < 2000 ? YAWN_MODE : { kind: "idle" }),
      seeded(8),
    );
    expect(frames.find(({ now }) => now < 2000)?.image).toBe("shut-yawn-cover");
    expect(frames.at(-1)?.image).not.toBe("shut-yawn-cover");
  });

  it("laisse la bouche gagner sur le bâillement", () => {
    const state = toNextFox({
      previous: FOX_START,
      now: 0,
      level: -15,
      rules,
      random: constant(0.5),
      mode: YAWN_MODE,
    });
    expect(toFoxDisplay(state, 0, rules).image.startsWith("left-")).toBe(true);
  });
});

describe("K : le sursaut d'un cri (mode flinch)", () => {
  it("montre left-large-rest, la tête choquée, tant que le mode dure, sans cligner ni changer de regard", () => {
    const { frames } = run(FOX_START, 0, 5000, FLINCH_MODE, seeded(4));
    for (const { image } of frames) expect(image).toBe("left-large-rest");
  });

  it("revient au regard après le sursaut", () => {
    const { frames } = run(
      FOX_START,
      0,
      4000,
      (now) => (now < 1000 ? FLINCH_MODE : { kind: "idle" }),
      seeded(8),
    );
    expect(frames.find(({ now }) => now < 1000)?.image).toBe("left-large-rest");
    expect(frames.find(({ now }) => now > 1500)?.image).not.toBe("left-large-rest");
  });

  it("laisse la bouche gagner sur le sursaut", () => {
    const state = toNextFox({
      previous: FOX_START,
      now: 0,
      level: -15,
      rules,
      random: constant(0.5),
      mode: FLINCH_MODE,
    });
    expect(toFoxDisplay(state, 0, rules).image.startsWith("left-")).toBe(true);
  });
});

describe("S : le sursaut du jeu (mode startle)", () => {
  it("montre left-large-rest, la tête choquée, tant que le mode dure, sans cligner ni changer de regard", () => {
    const { frames } = run(FOX_START, 0, 5000, STARTLE_MODE, seeded(5));
    for (const { image } of frames) expect(image).toBe("left-large-rest");
  });

  it("revient au regard après le sursaut", () => {
    const { frames } = run(
      FOX_START,
      0,
      4000,
      (now) => (now < 1000 ? STARTLE_MODE : { kind: "idle" }),
      seeded(9),
    );
    expect(frames.find(({ now }) => now < 1000)?.image).toBe("left-large-rest");
    expect(frames.find(({ now }) => now > 1500)?.image).not.toBe("left-large-rest");
  });

  it("laisse la bouche gagner sur le sursaut", () => {
    const state = toNextFox({
      previous: FOX_START,
      now: 0,
      level: -15,
      rules,
      random: constant(0.5),
      mode: STARTLE_MODE,
    });
    expect(toFoxDisplay(state, 0, rules).image.startsWith("left-")).toBe(true);
  });
});

describe("sans mode : le renard au repos comme avant", () => {
  it("regarde dans les trois directions quand aucun mode n'est donné", () => {
    let state = FOX_START;
    const random = seeded(21);
    const gazes = new Set<string>();
    for (let now = 0; now < 120_000; now += 16) {
      state = toNextFox({ previous: state, now, level: null, rules, random });
      gazes.add(state.gaze);
    }
    expect(gazes.size).toBe(3);
  });
});
