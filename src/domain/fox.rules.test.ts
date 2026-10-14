import { describe, expect, it } from "vitest";
import {
  BLINK_IMAGE,
  FOX_START,
  type FoxState,
  GAZE_IMAGES,
  isFoxMuted,
  MOUTH_IMAGES,
  type MouthImage,
  SMILE_GAZE,
  SULK_IMAGES,
  toFoxDisplay,
  toFoxRules,
  toMouthImage,
  toNextFox,
  toRms,
} from "./fox.rules";
import type { Attitude, FoxRules } from "./fox.schema";
import type { Settings } from "./settings.schema";

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

const constant = (value: number) => () => value;

const QUIET = -60;
const SMALL = -32;
const LOUD = -15;

// Fait avancer le renard de `from` à `to` (exclu) par pas de `stepMs`, avec le level donné à chaque instant.
const run = (
  start: FoxState,
  from: number,
  to: number,
  stepMs: number,
  level: number | null | ((now: number) => number | null),
  random: () => number,
  customRules: FoxRules = rules,
): { state: FoxState; history: { now: number; state: FoxState }[] } => {
  let state = start;
  const history: { now: number; state: FoxState }[] = [];
  for (let now = from; now < to; now += stepMs) {
    const current = typeof level === "function" ? level(now) : level;
    state = toNextFox({ previous: state, now, level: current, rules: customRules, random });
    history.push({ now, state });
  }
  return { state, history };
};

const imageOf = (state: FoxState, now: number): string => toFoxDisplay(state, now, rules).image;

describe("toFoxRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend les réglages fox* de settings.json sous des noms courts", () => {
    const settings: Settings = {
      ...base,
      foxVoice: "Microsoft Claude",
      foxSmallThreshold: -38,
      foxMediumThreshold: -26,
      foxLargeChance: 0.3,
      foxBounce: 0.04,
      foxBreathPeriod: 4000,
      foxBreath: 0.015,
      foxGazeMin: 5000,
      foxGazeMax: 15000,
      foxBlinkMin: 3000,
      foxBlinkMax: 6000,
      foxBlinkDuration: 150,
      foxListenMin: 2000,
      foxListenMax: 4000,
      foxJoyDuration: 800,
      foxCrouchDuration: 300,
      foxJumpDuration: 400,
      foxDiveDuration: 800,
      foxReturnDuration: 800,
    };
    expect(toFoxRules(settings)).toEqual(rules);
  });

  it("ne donne aucune règle quand settings.json n'a pas les réglages du renard", () => {
    expect(toFoxRules(base)).toBeUndefined();
  });
});

describe("isFoxMuted : une seule page fait entendre la voix", () => {
  it("rend l'aperçu muet dès qu'une page /fox est connectée, quel que soit leur nombre", () => {
    expect(isFoxMuted({ place: "preview", screens: 1 })).toBe(true);
    expect(isFoxMuted({ place: "preview", screens: 3 })).toBe(true);
  });

  it("laisse l'aperçu parler quand aucune page /fox n'est connectée", () => {
    expect(isFoxMuted({ place: "preview", screens: 0 })).toBe(false);
  });

  it("ne rend jamais muette la page /fox : c'est elle qui parle dans OBS", () => {
    expect(isFoxMuted({ place: "screen", screens: 0 })).toBe(false);
    expect(isFoxMuted({ place: "screen", screens: 1 })).toBe(false);
    expect(isFoxMuted({ place: "screen", screens: 4 })).toBe(false);
  });
});

describe("toRms", () => {
  it("vaut 0 pour le silence et pour aucun échantillon", () => {
    expect(toRms([0, 0, 0, 0])).toBe(0);
    expect(toRms([])).toBe(0);
  });

  it("vaut l'amplitude d'un signal carré", () => {
    expect(toRms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5, 10);
  });

  it("vaut 0,707 pour une sinusoïde de pleine amplitude", () => {
    const sine = Array.from({ length: 1000 }, (_, index) => Math.sin((2 * Math.PI * index) / 100));
    expect(toRms(sine)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});

describe("A : la bouche suit le level", () => {
  const mouth = (level: number, previous: MouthImage = MOUTH_IMAGES.closed, random = constant(0.99)) =>
    toMouthImage({ previous, level, rules, random });

  it("reste fermée sous le premier seuil, et pile sur le seuil", () => {
    expect(mouth(QUIET)).toBe("left-closed-rest");
    expect(mouth(-38)).toBe("left-closed-rest");
  });

  it("s'ouvre un peu au-dessus du premier seuil", () => {
    expect(mouth(-37.9)).toBe("left-small-rest");
    expect(mouth(-26)).toBe("left-small-rest");
  });

  it("s'ouvre moyennement au-dessus du second seuil", () => {
    expect(mouth(-25.9)).toBe("left-medium-rest");
  });

  it("remplace la moyenne par la grande quand le tirage est sous la fréquence de la grande bouche", () => {
    expect(mouth(LOUD, MOUTH_IMAGES.small, constant(0.29))).toBe("left-large-rest");
    expect(mouth(LOUD, MOUTH_IMAGES.small, constant(0.31))).toBe("left-medium-rest");
  });

  it("ne tire pas la grande bouche à chaque image : celle qui est ouverte le reste tant que le level tient", () => {
    expect(mouth(LOUD, MOUTH_IMAGES.medium, constant(0))).toBe("left-medium-rest");
    expect(mouth(LOUD, MOUTH_IMAGES.large, constant(0.99))).toBe("left-large-rest");
  });

  it("tire de nouveau après être repassée sous le second seuil", () => {
    const afterLarge = mouth(SMALL, MOUTH_IMAGES.large, constant(0));
    expect(afterLarge).toBe("left-small-rest");
    expect(mouth(LOUD, afterLarge, constant(0))).toBe("left-large-rest");
  });

  it("n'ouvre jamais en grand à 0 %, et ouvre toujours en grand à 100 %", () => {
    const never = { ...rules, largeChance: 0 };
    const always = { ...rules, largeChance: 1 };
    expect(
      toMouthImage({ previous: "left-small-rest", level: LOUD, rules: never, random: constant(0) }),
    ).toBe("left-medium-rest");
    expect(
      toMouthImage({ previous: "left-small-rest", level: LOUD, rules: always, random: constant(0.999) }),
    ).toBe("left-large-rest");
  });
});

describe("A : le renard qui parle", () => {
  it("montre la bouche du level, et regarde à gauche, même s'il regardait ailleurs", () => {
    const looking = { ...FOX_START, gaze: "right-closed-rest" as const };
    const state = toNextFox({ previous: looking, now: 100, level: SMALL, rules, random: constant(0.5) });
    expect(state.isSpeaking).toBe(true);
    expect(imageOf(state, 100)).toBe("left-small-rest");
  });

  it("ne montre que les quatre images de gauche pendant toute la parole", () => {
    const random = seeded(7);
    const level = (now: number) => -50 + 40 * Math.abs(Math.sin(now / 130));
    const { history } = run(FOX_START, 0, 30_000, 16, level, random);
    const seen = new Set(history.map(({ now, state }) => imageOf(state, now)));
    expect([...seen].sort()).toEqual([
      "left-closed-rest",
      "left-large-rest",
      "left-medium-rest",
      "left-small-rest",
    ]);
  });

  it("ouvre la bouche tout de suite quand la parole commence, sans attendre", () => {
    const state = toNextFox({ previous: FOX_START, now: 5000, level: LOUD, rules, random: constant(0.99) });
    expect(imageOf(state, 5000)).toBe("left-medium-rest");
  });

  it("garde une bouche au moins 60 ms avant d'en changer : un level qui saute à chaque image ne la fait pas vibrer", () => {
    const jumping = (now: number) => (Math.round(now / 16) % 2 === 0 ? LOUD : QUIET);
    const { history } = run(FOX_START, 0, 4000, 16, jumping, constant(0.99));
    const changes = history.filter(
      ({ now, state }, index) =>
        index > 0 && imageOf(state, now) !== imageOf(history[index - 1]?.state ?? state, now),
    );
    expect(changes.length).toBeGreaterThan(20);
    changes.forEach((change, index) => {
      const previous = changes[index - 1];
      if (previous) expect(change.now - previous.now).toBeGreaterThanOrEqual(60);
    });
  });

  it("change de bouche dès que les 60 ms sont passées", () => {
    const first = toNextFox({ previous: FOX_START, now: 1000, level: LOUD, rules, random: constant(0.99) });
    const tooSoon = toNextFox({ previous: first, now: 1059, level: QUIET, rules, random: constant(0.99) });
    expect(imageOf(tooSoon, 1059)).toBe("left-medium-rest");
    const later = toNextFox({ previous: first, now: 1060, level: QUIET, rules, random: constant(0.99) });
    expect(imageOf(later, 1060)).toBe("left-closed-rest");
  });

  it("revient au regard quand la parole s'arrête", () => {
    const talking = run(FOX_START, 0, 1000, 16, LOUD, constant(0.5)).state;
    const state = toNextFox({ previous: talking, now: 1016, level: null, rules, random: constant(0.5) });
    expect(state.isSpeaking).toBe(false);
    expect(GAZE_IMAGES).toContain(imageOf(state, 1016));
  });
});

describe("B : le regard change au hasard", () => {
  it("prévoit son premier changement entre l'intervalle min et max, au premier pas", () => {
    expect(
      toNextFox({ previous: FOX_START, now: 1000, level: null, rules, random: constant(0) }).gazeAt,
    ).toBe(6000);
    expect(
      toNextFox({ previous: FOX_START, now: 1000, level: null, rules, random: constant(1) }).gazeAt,
    ).toBe(16_000);
  });

  it("garde le regard jusqu'à l'instant prévu, puis passe à un autre des trois", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    expect(planned.gazeAt).toBe(5000);
    const before = toNextFox({ previous: planned, now: 4999, level: null, rules, random: constant(0.5) });
    expect(before.gaze).toBe(FOX_START.gaze);
    const after = toNextFox({ previous: planned, now: 5000, level: null, rules, random: constant(0.5) });
    expect(after.gaze).not.toBe(FOX_START.gaze);
    expect(GAZE_IMAGES).toContain(after.gaze);
    expect(after.gazeAt).toBe(5000 + 10_000);
  });

  it("ne reprend jamais le même regard, et passe par les trois, avec 5 à 15 s entre deux changements", () => {
    const { history } = run(FOX_START, 0, 600_000, 50, null, seeded(3));
    const changes = history.filter(
      ({ state }, index) => index > 0 && state.gaze !== history[index - 1]?.state.gaze,
    );
    expect(changes.length).toBeGreaterThan(30);
    const gazes = new Set(history.map(({ state }) => state.gaze));
    expect(gazes.size).toBe(3);
    changes.forEach((change, index) => {
      const previous = index === 0 ? 0 : (changes[index - 1]?.now ?? 0);
      if (index === 0) return;
      expect(change.now - previous).toBeGreaterThanOrEqual(5000);
      expect(change.now - previous).toBeLessThanOrEqual(15_050);
    });
  });

  it("ne change pas de regard en parlant, et reprend un intervalle entier ensuite", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    const talking = toNextFox({ previous: planned, now: 6000, level: LOUD, rules, random: constant(0.5) });
    expect(talking.gaze).toBe(FOX_START.gaze);
    expect(talking.gazeAt).toBeNull();
    const after = toNextFox({ previous: talking, now: 6016, level: null, rules, random: constant(0) });
    expect(after.gaze).toBe(FOX_START.gaze);
    expect(after.gazeAt).toBe(6016 + 5000);
  });
});

describe("B : il respire", () => {
  const at = (now: number) => toFoxDisplay(FOX_START, now, rules);

  it("s'étire d'une respiration à chaque période de 4 s, ancré aux pieds : seule la hauteur change", () => {
    expect(at(0).scaleY).toBeCloseTo(1, 10);
    expect(at(2000).scaleY).toBeCloseTo(1.015, 10);
    expect(at(4000).scaleY).toBeCloseTo(1, 10);
    expect(at(8000).scaleY).toBeCloseTo(1, 10);
    expect(at(2000).scaleX).toBe(1);
  });

  it("n'étire jamais plus que l'amplitude de la respiration", () => {
    for (let now = 0; now < 8000; now += 37) {
      expect(at(now).scaleY).toBeGreaterThanOrEqual(1 - 1e-12);
      expect(at(now).scaleY).toBeLessThanOrEqual(1.015 + 1e-12);
    }
  });

  it("suit la période réglée", () => {
    const quick = toFoxDisplay(FOX_START, 500, { ...rules, breathPeriod: 1000 });
    expect(quick.scaleY).toBeCloseTo(1.015, 10);
  });
});

describe("C : il cligne des yeux", () => {
  it("prévoit son premier clignement entre 3 et 6 s", () => {
    expect(
      toNextFox({ previous: FOX_START, now: 1000, level: null, rules, random: constant(0) }).blinkAt,
    ).toBe(4000);
    expect(
      toNextFox({ previous: FOX_START, now: 1000, level: null, rules, random: constant(1) }).blinkAt,
    ).toBe(7000);
  });

  it("ferme les yeux 150 ms pile, puis les rouvre et prévoit le suivant", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    expect(planned.blinkAt).toBe(3000);
    const shut = toNextFox({ previous: planned, now: 3000, level: null, rules, random: constant(0) });
    expect(imageOf(shut, 3000)).toBe(BLINK_IMAGE);
    expect(shut.blinkEndsAt).toBe(3150);
    const beforeEnd = toNextFox({ previous: shut, now: 3149, level: null, rules, random: constant(0) });
    expect(imageOf(beforeEnd, 3149)).toBe(BLINK_IMAGE);
    const open = toNextFox({ previous: shut, now: 3150, level: null, rules, random: constant(0) });
    expect(open.blinkEndsAt).toBeNull();
    expect(GAZE_IMAGES).toContain(imageOf(open, 3150));
    expect(open.blinkAt).toBe(3150 + 3000);
  });

  it("cligne toutes les 3 à 6 s au repos, 150 ms à chaque fois", () => {
    const { history } = run(FOX_START, 0, 300_000, 16, null, seeded(11));
    const starts = history.filter(
      ({ now, state }, index) =>
        imageOf(state, now) === BLINK_IMAGE &&
        (index === 0 || imageOf(history[index - 1]?.state ?? state, 0) !== BLINK_IMAGE),
    );
    expect(starts.length).toBeGreaterThan(40);
    starts.forEach((start, index) => {
      const next = starts[index + 1];
      if (next) {
        expect(next.now - start.now).toBeGreaterThanOrEqual(3000 + 150 - 16);
        expect(next.now - start.now).toBeLessThanOrEqual(6000 + 150 + 16);
      }
    });
    const shutFrames = history.filter(({ now, state }) => imageOf(state, now) === BLINK_IMAGE).length;
    expect(shutFrames / starts.length).toBeGreaterThanOrEqual(9);
    expect(shutFrames / starts.length).toBeLessThanOrEqual(10.5);
  });

  it("ne cligne jamais pendant qu'il parle, même quand l'instant prévu tombe en pleine parole", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    expect(planned.blinkAt).toBe(3000);
    const { history } = run(planned, 100, 20_000, 16, LOUD, seeded(5));
    for (const { now, state } of history) {
      expect(imageOf(state, now)).not.toBe(BLINK_IMAGE);
      expect(state.blinkEndsAt).toBeNull();
    }
  });

  it("rouvre les yeux sur la bouche si la parole commence pendant un clignement", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    const shut = toNextFox({ previous: planned, now: 3000, level: null, rules, random: constant(0) });
    const talking = toNextFox({ previous: shut, now: 3016, level: SMALL, rules, random: constant(0.5) });
    expect(imageOf(talking, 3016)).toBe("left-small-rest");
    expect(talking.blinkEndsAt).toBeNull();
  });

  it("repart d'un intervalle entier après la parole, au lieu de cligner aussitôt", () => {
    const planned = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0) });
    const talking = toNextFox({ previous: planned, now: 5000, level: LOUD, rules, random: constant(0) });
    const after = toNextFox({ previous: talking, now: 5016, level: null, rules, random: constant(0) });
    expect(imageOf(after, 5016)).not.toBe(BLINK_IMAGE);
    expect(after.blinkAt).toBe(5016 + 3000);
  });
});

describe("A : le corps rebondit avec le level", () => {
  const settled = (level: number | null): FoxState => run(FOX_START, 0, 2000, 16, level, constant(0.5)).state;

  it("s'étire au-dessus du second seuil et s'écrase sous le premier, ancré aux pieds", () => {
    const loud = toFoxDisplay(settled(LOUD), 0, rules);
    expect(loud.scaleY).toBeCloseTo(1 + 0.04, 3);
    expect(loud.scaleX).toBeCloseTo(1 - 0.02, 3);
    const quiet = toFoxDisplay(settled(QUIET), 0, rules);
    expect(quiet.scaleY).toBeCloseTo(1 - 0.04, 3);
    expect(quiet.scaleX).toBeCloseTo(1 + 0.02, 3);
  });

  it("reste neutre à mi-chemin des deux seuils", () => {
    const middle = toFoxDisplay(settled(-32), 0, rules);
    expect(middle.scaleY).toBeCloseTo(1, 3);
    expect(middle.scaleX).toBeCloseTo(1, 3);
  });

  it("s'amplifie avec le réglage du rebond, et disparaît à 0", () => {
    const stronger = { ...rules, bounce: 0.08 };
    const state = run(FOX_START, 0, 2000, 16, LOUD, constant(0.5), stronger).state;
    expect(toFoxDisplay(state, 0, stronger).scaleY).toBeCloseTo(1.08, 3);
    const none = { ...rules, bounce: 0 };
    const quiet = run(FOX_START, 0, 2000, 16, LOUD, constant(0.5), none).state;
    expect(toFoxDisplay(quiet, 0, none).scaleY).toBeCloseTo(1, 10);
  });

  it("ne saute pas : le premier pas parlé ne fait qu'entamer l'étirement", () => {
    let state = toNextFox({ previous: FOX_START, now: 0, level: null, rules, random: constant(0.5) });
    state = toNextFox({ previous: state, now: 16, level: LOUD, rules, random: constant(0.5) });
    expect(state.bounce).toBeGreaterThan(0);
    expect(state.bounce).toBeLessThan(0.5);
  });

  it("revient à sa taille de repos une fois la parole finie", () => {
    const talking = settled(LOUD);
    const rested = run(talking, 2000, 4000, 16, null, constant(0.5)).state;
    expect(Math.abs(rested.bounce)).toBeLessThan(0.001);
  });

  it("ne dépasse jamais l'amplitude du rebond, quel que soit le level", () => {
    const loudest = run(FOX_START, 0, 5000, 16, 0, constant(0.5)).state;
    const quietest = run(FOX_START, 0, 5000, 16, -100, constant(0.5)).state;
    expect(toFoxDisplay(loudest, 0, rules).scaleY).toBeLessThanOrEqual(1.04 + 1e-9);
    expect(toFoxDisplay(quietest, 0, rules).scaleY).toBeGreaterThanOrEqual(0.96 - 1e-9);
  });

  it("ne s'emballe pas quand la page reprend après une longue pause (onglet caché)", () => {
    const talking = toNextFox({ previous: FOX_START, now: 0, level: LOUD, rules, random: constant(0.5) });
    const resumed = toNextFox({ previous: talking, now: 600_000, level: LOUD, rules, random: constant(0.5) });
    expect(resumed.bounce).toBeLessThanOrEqual(1);
    expect(resumed.bounce).toBeGreaterThan(0);
  });
});

describe("R : son humeur change ses regards au repos", () => {
  // Un regard prévu à `gazeAt`, dans l'humeur donnée.
  const planned = (gaze: FoxState["gaze"], gazeAt: number): FoxState => ({ ...FOX_START, gaze, gazeAt });
  const at = (previous: FoxState, now: number, random: () => number, attitude: Attitude) =>
    toNextFox({ previous, now, level: null, rules, random, attitude });

  it("ordinaire ou sans précision, ses regards sont les trois d'avant", () => {
    const previous = planned("left-closed-rest", 1000);
    expect(at(previous, 1000, constant(0.5), "plain")).toEqual(
      toNextFox({ previous, now: 1000, level: null, rules, random: constant(0.5) }),
    );
  });

  describe("boudeur", () => {
    it("ne regarde jamais vers le tchat : seulement la droite et la face", () => {
      expect(SULK_IMAGES).toEqual(["front-closed-rest", "right-closed-rest"]);
      let state = FOX_START;
      const seen = new Set<string>();
      const random = seeded(11);
      for (let now = 0; now < 1_800_000; now += 50) {
        state = toNextFox({ previous: state, now, level: null, rules, random, attitude: "sulking" });
        seen.add(state.gaze);
      }
      expect([...seen].sort()).toEqual(["front-closed-rest", "right-closed-rest"]);
    });

    it("se détourne tout de suite du tchat s'il le regardait, et change de regard à l'intervalle du repos", () => {
      const looking = planned("left-closed-rest", 9000);
      const next = at(looking, 2000, constant(0), "sulking");
      expect(SULK_IMAGES).toContain(next.gaze);
      expect(next.gazeAt).toBe(2000 + 5000);
    });

    it("garde un regard permis et son instant prévu", () => {
      const state = planned("right-closed-rest", 9000);
      const next = at(state, 2000, constant(0), "sulking");
      expect(next.gaze).toBe("right-closed-rest");
      expect(next.gazeAt).toBe(9000);
    });

    it("alterne la droite et la face au changement, jamais le même deux fois", () => {
      const state = planned("right-closed-rest", 1000);
      expect(at(state, 1000, constant(0), "sulking").gaze).toBe("front-closed-rest");
      expect(at(planned("front-closed-rest", 1000), 1000, constant(0.9), "sulking").gaze).toBe(
        "right-closed-rest",
      );
    });

    it("regarde en face ou à droite aussi quand il écoute, comme avant", () => {
      const next = toNextFox({
        previous: FOX_START,
        now: 0,
        level: null,
        rules,
        random: constant(0),
        mode: { kind: "listening" },
        attitude: "sulking",
      });
      expect(SULK_IMAGES).toContain(next.gaze);
      expect(next.gazeAt).toBe(2000);
    });
  });

  describe("joyeux", () => {
    it("ajoute le sourire à la rotation : un tirage sous un tiers donne front-smile-rest", () => {
      const state = planned("left-closed-rest", 1000);
      expect(at(state, 1000, constant(0), "cheerful").gaze).toBe("front-smile-rest");
      expect(at(state, 1000, constant(0.32), "cheerful").gaze).toBe("front-smile-rest");
      expect(SMILE_GAZE).toBe("front-smile-rest");
    });

    it("garde les trois regards d'avant le reste du temps", () => {
      const state = planned("left-closed-rest", 1000);
      const next = at(state, 1000, constant(0.5), "cheerful");
      expect(GAZE_IMAGES).toContain(next.gaze);
      expect(next.gaze).not.toBe("left-closed-rest");
    });

    it("garde le sourire jusqu'au changement prévu, puis prend un autre regard : jamais deux sourires de suite", () => {
      const smiling = planned("front-smile-rest", 8000);
      const before = at(smiling, 7999, constant(0), "cheerful");
      expect(before.gaze).toBe("front-smile-rest");
      expect(before.gazeAt).toBe(8000);
      const after = at(smiling, 8000, constant(0), "cheerful");
      expect(GAZE_IMAGES).toContain(after.gaze);
    });

    it("sourit une fois sur trois environ, parmi les regards du repos", () => {
      let state = FOX_START;
      const random = seeded(5);
      let changes = 0;
      let smiles = 0;
      for (let now = 0; now < 36_000_000; now += 100) {
        const next = toNextFox({ previous: state, now, level: null, rules, random, attitude: "cheerful" });
        if (next.gaze !== state.gaze) {
          changes += 1;
          if (next.gaze === SMILE_GAZE) smiles += 1;
        }
        state = next;
      }
      expect(changes).toBeGreaterThan(2000);
      // Un sourire ne se répète jamais : 1 changement sur 4 environ, au plus 1 sur 3.
      expect(smiles / changes).toBeGreaterThan(0.2);
      expect(smiles / changes).toBeLessThanOrEqual(1 / 3);
    });

    it("n'affiche pas le sourire quand il écoute Alexis : face ou droite", () => {
      const next = toNextFox({
        previous: planned("front-smile-rest", 100_000),
        now: 0,
        level: null,
        rules,
        random: constant(0),
        mode: { kind: "listening" },
        attitude: "cheerful",
      });
      expect(next.gaze).toBe("front-closed-rest");
    });

    it("montre le sourire à l'écran quand c'est son regard, sauf s'il cligne", () => {
      const smiling: FoxState = { ...planned("front-smile-rest", 8000), at: 0 };
      expect(imageOf(smiling, 0)).toBe("front-smile-rest");
      expect(imageOf({ ...smiling, blinkEndsAt: 100 }, 0)).toBe(BLINK_IMAGE);
    });
  });

  it("retrouve les trois regards d'avant quand l'humeur redevient ordinaire, le sourire laissant sa place", () => {
    const smiling = planned("front-smile-rest", 8000);
    const next = at(smiling, 2000, constant(0), "plain");
    expect(GAZE_IMAGES).toContain(next.gaze);
    expect(next.gazeAt).toBe(2000 + 5000);
  });
});
