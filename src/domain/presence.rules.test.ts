import { describe, expect, it } from "vitest";
import {
  CROUCH_SQUASH,
  DEPARTURE_JUMP_HEIGHT,
  DIVE_ANGLE,
  HIDDEN_OFFSET,
  type PresenceCurves,
  type PresenceEvent,
  type PresenceRules,
  type PresenceState,
  toNextPose,
  toNextPresence,
  toPresenceBody,
  toPresenceView,
  toReturnCurve,
  toStartPresence,
  toVisibleIn,
} from "./presence.rules";

const rules: PresenceRules = { awayAfter: 180_000, yawnMs: 2000, leaveMs: 1500, returnMs: 800 };
// Ce que la page sait du départ : s'accroupir 300 ms, sauter 400 ms, plonger 800 ms (1,5 s en tout), revenir en 800 ms.
const curves: PresenceCurves = { crouchMs: 300, jumpMs: 400, diveMs: 800, returnMs: 800 };
const IDLE_PLACE = { offset: 0, angle: 0 };
const THREE_MINUTES = 180_000;

// Fait avancer le temps par pas de 100 ms, comme la boucle du serveur, avec des évènements à des dates précises.
const run = (
  start: PresenceState,
  from: number,
  to: number,
  events: Record<number, PresenceEvent> = {},
): { state: PresenceState; trail: { now: number; state: PresenceState }[] } => {
  let state = start;
  const trail: { now: number; state: PresenceState }[] = [];
  for (let now = from; now <= to; now += 100) {
    state = toNextPresence(state, { now, event: events[now] }, rules);
    trail.push({ now, state });
  }
  return { state, trail };
};

const kindsOf = (trail: { state: PresenceState }[]): string[] =>
  trail.map(({ state }) => state.kind).filter((kind, index, all) => index === 0 || kind !== all[index - 1]);

describe("H : il s'en va après 3 min sans parler", () => {
  it("est visible au départ, et le reste avant 3 min", () => {
    const { state } = run(toStartPresence(0), 0, THREE_MINUTES - 100);
    expect(state.kind).toBe("visible");
  });

  it("bâille à 3 min pile, puis glisse vers le bas, puis est parti", () => {
    const { trail } = run(toStartPresence(0), 0, THREE_MINUTES + 10_000);
    expect(kindsOf(trail)).toEqual(["visible", "yawning", "leaving", "away"]);
    const at = (kind: string) => trail.find(({ state }) => state.kind === kind)?.now;
    expect(at("yawning")).toBe(THREE_MINUTES);
    expect(at("leaving")).toBe(THREE_MINUTES + 2000);
    expect(at("away")).toBe(THREE_MINUTES + 2000 + 1500);
  });

  it("n'enchaîne ni deuxième bâillement ni retour tant que rien ne le réveille", () => {
    const { state, trail } = run(toStartPresence(0), 0, 20 * 60_000);
    expect(state.kind).toBe("away");
    expect(trail.filter(({ state: s }) => s.kind === "yawning").length).toBeLessThanOrEqual(25);
    expect(kindsOf(trail)).toEqual(["visible", "yawning", "leaving", "away"]);
  });

  it("repart de zéro à la fin de chaque phrase : il bâille 3 min après la dernière, pas 3 min après le départ", () => {
    const before = run(toStartPresence(0), 0, 349_900, { 170000: "spoke" });
    expect(before.state.kind).toBe("visible");
    const after = run(before.state, 350_000, 351_000);
    expect(after.trail[0]?.state).toEqual({ kind: "yawning", since: 350_000, spokeAt: 170_000 });
  });

  it("suit le délai réglé", () => {
    const short: PresenceRules = { ...rules, awayAfter: 60_000 };
    let state = toStartPresence(0);
    state = toNextPresence(state, { now: 59_900 }, short);
    expect(state.kind).toBe("visible");
    state = toNextPresence(state, { now: 60_000 }, short);
    expect(state.kind).toBe("yawning");
  });

  it("enchaîne les phases sans les décaler quand un pas arrive très en retard", () => {
    const state = toNextPresence(toStartPresence(0), { now: THREE_MINUTES + 10_000 }, rules);
    expect(state).toEqual({ kind: "away", since: THREE_MINUTES + 2000 + 1500, spokeAt: 0 });
  });
});

describe("H : il revient en sautant", () => {
  const away: PresenceState = { kind: "away", since: 200_000, spokeAt: 0 };

  it("revient dès qu'on le réveille, saute pendant 800 ms, puis est visible", () => {
    const { trail } = run(away, 300_000, 302_000, { 300000: "wake" });
    expect(kindsOf(trail)).toEqual(["returning", "visible"]);
    expect(trail.find(({ state }) => state.kind === "visible")?.now).toBe(300_800);
  });

  it("repart de zéro au réveil : le prochain départ est à 3 min du réveil", () => {
    const { trail } = run(away, 300_000, 300_000 + THREE_MINUTES + 100, { 300000: "wake" });
    expect(trail.find(({ state }) => state.kind === "yawning")?.now).toBe(300_000 + THREE_MINUTES);
  });

  it("revient aussi quand on le réveille en pleine descente", () => {
    const leaving: PresenceState = { kind: "leaving", since: 100_000, spokeAt: 0 };
    const state = toNextPresence(leaving, { now: 100_400, event: "wake" }, rules);
    expect(state).toEqual({ kind: "returning", since: 100_400, spokeAt: 100_400 });
  });

  it("reste visible, sans bâiller, quand on le réveille en plein bâillement", () => {
    const yawning: PresenceState = { kind: "yawning", since: THREE_MINUTES, spokeAt: 0 };
    const state = toNextPresence(yawning, { now: THREE_MINUTES + 500, event: "wake" }, rules);
    expect(state.kind).toBe("visible");
    expect(state.spokeAt).toBe(THREE_MINUTES + 500);
  });

  it("ne change rien quand on le réveille alors qu'il est visible ou qu'il revient déjà, sauf le délai", () => {
    const visible = toStartPresence(0);
    expect(toNextPresence(visible, { now: 5000, event: "wake" }, rules)).toEqual({
      ...visible,
      spokeAt: 5000,
    });
    const returning: PresenceState = { kind: "returning", since: 1000, spokeAt: 1000 };
    expect(toNextPresence(returning, { now: 1200, event: "wake" }, rules)).toEqual({
      ...returning,
      spokeAt: 1200,
    });
  });

  it("revient quand une page /fox se connecte : il est visible et le délai repart (reset)", () => {
    const state = toNextPresence(away, { now: 400_000, event: "reset" }, rules);
    expect(state).toEqual({ kind: "visible", since: 400_000, spokeAt: 400_000 });
  });
});

describe("toPresenceView", () => {
  it("dit visible pendant le bâillement : il est encore là", () => {
    expect(toPresenceView({ kind: "yawning", since: 0, spokeAt: 0 })).toBe("visible");
    expect(toPresenceView({ kind: "leaving", since: 0, spokeAt: 0 })).toBe("leaving");
    expect(toPresenceView({ kind: "away", since: 0, spokeAt: 0 })).toBe("away");
    expect(toPresenceView({ kind: "returning", since: 0, spokeAt: 0 })).toBe("returning");
  });
});

describe("toVisibleIn : dans combien de ms il est entièrement visible", () => {
  it("tout de suite quand il est visible ou qu'il bâille", () => {
    expect(toVisibleIn(toStartPresence(0), 5, rules)).toBe(0);
    expect(toVisibleIn({ kind: "yawning", since: 0, spokeAt: 0 }, 5, rules)).toBe(0);
  });

  it("le reste du saut quand il revient", () => {
    const returning: PresenceState = { kind: "returning", since: 1000, spokeAt: 1000 };
    expect(toVisibleIn(returning, 1000, rules)).toBe(800);
    expect(toVisibleIn(returning, 1500, rules)).toBe(300);
    expect(toVisibleIn(returning, 2500, rules)).toBe(0);
  });

  it("le saut entier quand il est parti ou qu'il part encore : il faut d'abord le réveiller", () => {
    expect(toVisibleIn({ kind: "away", since: 0, spokeAt: 0 }, 5, rules)).toBe(800);
    expect(toVisibleIn({ kind: "leaving", since: 0, spokeAt: 0 }, 5, rules)).toBe(800);
  });
});

describe("toPresenceBody : la place, l'angle et l'écrasement sur la page", () => {
  const body = (kind: "visible" | "leaving" | "away" | "returning", elapsed: number, from = IDLE_PLACE) =>
    toPresenceBody({ kind, elapsed, from }, curves);
  const departure = (from: number, to: number, step = 10) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) =>
      body("leaving", from + index * step),
    );

  it("est à sa place, droit et à sa taille quand il est visible", () => {
    expect(body("visible", 123_456)).toEqual({ offset: 0, angle: 0, squashX: 1, squashY: 1 });
  });

  it("s'écrase en s'accroupissant : plus bas et plus large, sans bouger de sa place", () => {
    expect(body("leaving", 0)).toEqual({ offset: 0, angle: 0, squashX: 1, squashY: 1 });
    const crouched = body("leaving", 299);
    expect(crouched.squashY).toBeCloseTo(1 - CROUCH_SQUASH, 2);
    expect(crouched.squashX).toBeGreaterThan(1.05);
    expect(crouched.offset).toBe(0);
    expect(crouched.angle).toBe(0);
    const heights = departure(0, 290).map(({ squashY }) => squashY);
    for (const [index, height] of heights.entries()) {
      if (index > 0) expect(height).toBeLessThanOrEqual(heights[index - 1] ?? 1);
    }
  });

  it("se détend en sautant : monte de 9 % de la toile au plus, droit, étiré au décollage puis à sa taille", () => {
    const jump = departure(300, 699);
    const offsets = jump.map(({ offset }) => offset);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-DEPARTURE_JUMP_HEIGHT - 1e-9);
    expect(Math.min(...offsets)).toBeLessThan(-0.08);
    expect(offsets.every((offset, index) => index === 0 || offset <= (offsets[index - 1] ?? 0))).toBe(true);
    expect(jump.every(({ angle }) => angle === 0)).toBe(true);
    expect(Math.max(...jump.map(({ squashY }) => squashY))).toBeGreaterThan(1.05);
    expect(body("leaving", 699).squashY).toBeCloseTo(1, 1);
  });

  it("plonge : la chute accélère et il tourne progressivement jusqu'à la tête en bas", () => {
    const dive = departure(700, 1500);
    const offsets = dive.map(({ offset }) => offset);
    const angles = dive.map(({ angle }) => angle);
    expect(offsets.every((offset, index) => index === 0 || offset >= (offsets[index - 1] ?? 0))).toBe(true);
    // Il tourne dans le sens inverse des aiguilles d'une montre, du côté de son museau : l'angle décroît de 0 à -180.
    expect(angles.every((angle, index) => index === 0 || angle <= (angles[index - 1] ?? 0))).toBe(true);
    expect(Math.max(...angles)).toBeLessThanOrEqual(0);
    expect(DIVE_ANGLE).toBe(-180);
    expect(angles[0]).toBeCloseTo(0, 5);
    expect(angles.at(-1)).toBe(DIVE_ANGLE);
    const speeds = offsets.slice(1).map((offset, index) => offset - (offsets[index] ?? 0));
    expect(speeds[speeds.length - 1]).toBeGreaterThan((speeds[0] ?? 0) * 5);
    expect(dive.every(({ squashX, squashY }) => squashX === 1 && squashY === 1)).toBe(true);
  });

  it("sort entièrement de la source à la fin du plongeon, et y reste", () => {
    expect(HIDDEN_OFFSET).toBeGreaterThan(1);
    expect(body("leaving", 1500)).toEqual({
      offset: HIDDEN_OFFSET,
      angle: DIVE_ANGLE,
      squashX: 1,
      squashY: 1,
    });
    expect(body("leaving", 9999)).toEqual(body("leaving", 1500));
  });

  it("enchaîne les trois temps sans à-coup : jamais plus de 4 % de la toile, 5 degrés ni 5 % d'écrasement en 10 ms", () => {
    const all = departure(0, 1500);
    for (const [index, current] of all.entries()) {
      const previous = all[index - 1];
      if (!previous) continue;
      expect(Math.abs(current.offset - previous.offset)).toBeLessThan(0.04);
      expect(Math.abs(current.angle - previous.angle)).toBeLessThan(5);
      expect(Math.abs(current.squashY - previous.squashY)).toBeLessThan(0.05);
    }
  });

  it("suit les durées réglées : un plongeon plus court finit plus tôt", () => {
    const quick: PresenceCurves = { ...curves, diveMs: 400 };
    expect(toPresenceBody({ kind: "leaving", elapsed: 1100, from: IDLE_PLACE }, quick).offset).toBe(
      HIDDEN_OFFSET,
    );
    expect(toPresenceBody({ kind: "leaving", elapsed: 1100, from: IDLE_PLACE }, curves).offset).toBeLessThan(
      HIDDEN_OFFSET,
    );
  });

  it("est parti, droit et hors de la source quand le serveur dit qu'il est parti", () => {
    expect(body("away", 0)).toEqual({ offset: HIDDEN_OFFSET, angle: 0, squashX: 1, squashY: 1 });
  });

  it("saute depuis le bas : monte au-dessus de sa place, retombe, rebondit un peu, et finit à sa place", () => {
    const from = { offset: HIDDEN_OFFSET, angle: 0 };
    expect(body("returning", 0, from).offset).toBeCloseTo(HIDDEN_OFFSET, 10);
    const values = Array.from({ length: 81 }, (_, index) => body("returning", index * 10, from).offset);
    expect(Math.min(...values)).toBeLessThan(-0.05);
    expect(Math.min(...values)).toBeGreaterThan(-0.12);
    expect(body("returning", 800, from).offset).toBeCloseTo(0, 10);
    // Il passe d'abord au-dessus de sa place, puis le rebond d'arrivée le remonte un peu.
    const landing = values.slice(Math.floor(0.85 * 80));
    expect(Math.min(...landing)).toBeLessThan(0);
    expect(Math.min(...landing)).toBeGreaterThan(-0.05);
  });

  it("ne sort pas de sa place une fois arrivé : l'offset reste à 0 au-delà du saut", () => {
    expect(body("returning", 5000, { offset: HIDDEN_OFFSET, angle: 0 }).offset).toBeCloseTo(0, 10);
  });

  it("part de là où il est si on le réveille en plein plongeon, et se redresse pendant le début du saut", () => {
    const from = { offset: 0.5, angle: -120 };
    expect(body("returning", 0, from).offset).toBeCloseTo(0.5, 10);
    expect(body("returning", 0, from).angle).toBeCloseTo(-120, 10);
    const angles = Array.from({ length: 81 }, (_, index) => body("returning", index * 10, from).angle);
    // Il se redresse du même côté qu'il a tourné : l'angle remonte de -120 à 0, sans jamais passer du côté positif.
    expect(angles.every((angle, index) => index === 0 || angle >= (angles[index - 1] ?? 0))).toBe(true);
    expect(body("returning", 320, from).angle).toBeCloseTo(0, 10);
    expect(Math.max(...angles)).toBeLessThanOrEqual(0);
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(-120);
  });

  it("se pose simplement quand on le réveille au-dessus de sa place, pendant le saut du départ", () => {
    const from = { offset: -0.06, angle: 0 };
    const offsets = Array.from({ length: 81 }, (_, index) => body("returning", index * 10, from).offset);
    expect(offsets[0]).toBeCloseTo(-0.06, 10);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1e-9);
    expect(offsets.at(-1)).toBeCloseTo(0, 10);
  });
});

describe("toReturnCurve", () => {
  it("vaut 1 au départ et 0 à l'arrivée, et reste dans un petit rebond autour de 0 à la fin", () => {
    expect(toReturnCurve(0)).toBe(1);
    expect(toReturnCurve(1)).toBeCloseTo(0, 10);
    expect(toReturnCurve(-5)).toBe(1);
    expect(toReturnCurve(9)).toBeCloseTo(0, 10);
  });

  it("est continue : aucun saut brusque entre deux pas de 1 %", () => {
    let previous = toReturnCurve(0);
    for (let step = 1; step <= 100; step += 1) {
      const value = toReturnCurve(step / 100);
      expect(Math.abs(value - previous)).toBeLessThan(0.12);
      previous = value;
    }
  });
});

describe("toNextPose : la pose que la page prend à chaque phase annoncée", () => {
  const visible = { kind: "visible", elapsed: 0, from: IDLE_PLACE } as const;

  it("part de sa place quand il commence à partir", () => {
    expect(toNextPose(visible, { presence: "leaving", elapsed: 0 }, curves)).toEqual({
      kind: "leaving",
      elapsed: 0,
      from: IDLE_PLACE,
    });
  });

  it("part du bas, droit, quand il revient d'être parti", () => {
    const away = { kind: "away", elapsed: 0, from: IDLE_PLACE } as const;
    expect(toNextPose(away, { presence: "returning", elapsed: 0 }, curves).from).toEqual({
      offset: HIDDEN_OFFSET,
      angle: 0,
    });
  });

  it("remonte d'à mi-plongeon, la tête en bas, quand on le réveille en plein départ", () => {
    const leaving = { kind: "leaving", elapsed: 1100, from: IDLE_PLACE } as const;
    const here = toPresenceBody(leaving, curves);
    expect(here.offset).toBeGreaterThan(0.05);
    expect(here.offset).toBeLessThan(HIDDEN_OFFSET);
    expect(here.angle).toBeLessThan(-10);
    expect(here.angle).toBeGreaterThan(DIVE_ANGLE);
    const next = toNextPose(leaving, { presence: "returning", elapsed: 0 }, curves);
    expect(next.from.offset).toBeCloseTo(here.offset, 10);
    expect(next.from.angle).toBeCloseTo(here.angle, 10);
  });

  it("fait remonter du bas une page qui se connecte en plein retour, sans avoir vu le départ", () => {
    const pose = toNextPose(visible, { presence: "returning", elapsed: 300 }, curves);
    expect(pose).toEqual({ kind: "returning", elapsed: 300, from: { offset: HIDDEN_OFFSET, angle: 0 } });
    expect(toPresenceBody(pose, curves).offset).toBeLessThan(HIDDEN_OFFSET);
  });

  it("est à sa place une fois revenu", () => {
    const returning = { kind: "returning", elapsed: 800, from: { offset: HIDDEN_OFFSET, angle: 0 } } as const;
    const pose = toNextPose(returning, { presence: "visible", elapsed: 0 }, curves);
    expect(toPresenceBody(pose, curves).offset).toBeCloseTo(0, 10);
  });
});
