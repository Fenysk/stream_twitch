import { describe, expect, it } from "vitest";
import { type Show, STARTLE_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { createFoxStartle } from "./fox-startle.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxStartleRise: 20,
  foxStartleWithin: 300,
  foxStartleLevel: -15,
  foxStartleGap: 30_000,
};

// Un serveur à la main : l'heure, la présence du renard, ce qu'il a à dire, le son du PC et ce qu'il montre.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    presence: { kind: "visible" as "visible" | "leaving" | "away" | "returning", elapsed: 0 },
    queued: 0,
    flashMs: 1000,
    hear: (_level: number): void => undefined,
    subscribers: 0,
  };
  const flashes: Show[] = [];
  const logs: string[] = [];
  const startle = createFoxStartle({
    desktop: {
      subscribe(listener) {
        state.hear = listener;
        state.subscribers += 1;
        return () => {
          state.hear = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    queue: { count: () => state.queued },
    mode: {
      flash(show) {
        flashes.push(show);
        return state.flashMs;
      },
    },
    fox: { getPresence: () => state.presence },
    settings: custom,
    clock: () => state.now,
    log: (line) => logs.push(line),
  });
  startle.start();
  // Le son du PC, une mesure toutes les 50 ms : chaque niveau de la liste, l'un après l'autre.
  const play = (...levels: number[]) => {
    for (const level of levels) {
      state.hear(level);
      state.now += 50;
    }
  };
  return { startle, state, flashes, logs, play };
};

describe("createFoxStartle : le sursaut du jeu", () => {
  it("sursaute à une hausse de 20 dB en moins de 300 ms, jusqu'au-dessus de -15 dB", () => {
    const { play, flashes } = setup();
    play(-45, -45, -44, -10);
    expect(flashes).toEqual([STARTLE_MODE]);
  });

  it("l'écrit au journal", () => {
    const { play, logs } = setup();
    play(-45, -45, -10);
    expect(logs).toEqual(["Renard : le son du jeu explose, il sursaute."]);
  });

  it("ne sursaute pas pour une hausse de moins de 20 dB, même au-dessus de -15 dB", () => {
    const { play, flashes } = setup();
    play(-26, -26, -10);
    expect(flashes).toEqual([]);
  });

  it("ne sursaute pas pour une hausse de 20 dB qui n'atteint pas -15 dB", () => {
    const { play, flashes } = setup();
    play(-70, -70, -40);
    expect(flashes).toEqual([]);
  });

  it("ne sursaute pas pour une hausse lente : 20 dB en plus de 300 ms", () => {
    const { play, flashes } = setup();
    // 2 dB toutes les 50 ms : 20 dB en 500 ms, jamais plus de 10 dB en 250 ms.
    play(...Array.from({ length: 15 }, (_, index) => -40 + 2 * index));
    expect(flashes).toEqual([]);
  });

  it("ne sursaute pas pour un son déjà fort, ni à la toute première mesure", () => {
    const { play, flashes } = setup();
    play(-10);
    play(-9, -8, -10, -7);
    expect(flashes).toEqual([]);
  });

  it("sursaute au plus une fois toutes les 30 s, puis de nouveau après", () => {
    const { play, state, flashes } = setup();
    play(-45, -45, -10);
    state.now += 20_000;
    play(-45, -45, -10);
    expect(flashes).toHaveLength(1);
    state.now += 10_000;
    play(-45, -45, -10);
    expect(flashes).toHaveLength(2);
  });

  it("ne sursaute pas caché, parti, en train de partir ou de revenir, et n'attend pas 30 s pour autant", () => {
    const { play, state, flashes } = setup();
    for (const kind of ["away", "leaving", "returning"] as const) {
      state.presence = { kind, elapsed: 500 };
      play(-45, -45, -10);
      state.now += 1000;
    }
    expect(flashes).toEqual([]);
    state.presence = { kind: "visible", elapsed: 0 };
    play(-45, -45, -10);
    expect(flashes).toHaveLength(1);
  });

  it("ne sursaute pas quand il parle ou qu'une phrase l'attend : la file n'est pas vide", () => {
    const { play, state, flashes } = setup();
    state.queued = 1;
    play(-45, -45, -10);
    expect(flashes).toEqual([]);
    state.queued = 0;
    state.now += 1000;
    play(-45, -45, -10);
    expect(flashes).toHaveLength(1);
  });

  it("ne compte pas un sursaut que rien n'a montré (déjà occupé) pour l'écart de 30 s", () => {
    const { play, state, flashes, logs } = setup();
    state.flashMs = 0;
    play(-45, -45, -10);
    expect(flashes).toHaveLength(1);
    expect(logs).toEqual([]);
    state.flashMs = 1000;
    state.now += 1000;
    play(-45, -45, -10);
    expect(flashes).toHaveLength(2);
  });

  it("suit les réglages changés en direct : une hausse plus faible, un level plus bas", () => {
    const { startle, play, flashes } = setup();
    startle.update({ ...settings, foxStartleRise: 10, foxStartleLevel: -30 });
    play(-45, -45, -28);
    expect(flashes).toHaveLength(1);
  });

  it("ne fait rien sans les réglages du renard", () => {
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.play(-60, -60, -5);
    expect(none.flashes).toEqual([]);
  });

  it("se désabonne à l'arrêt, et ne s'abonne pas deux fois au démarrage", () => {
    const { startle, state } = setup();
    startle.start();
    expect(state.subscribers).toBe(1);
    startle.stop();
    expect(state.subscribers).toBe(0);
  });
});
