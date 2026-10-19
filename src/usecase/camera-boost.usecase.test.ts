import { describe, expect, it } from "vitest";
import { BOOST_MAX_DB, BOOST_PERIOD_MS } from "../domain/boost.rules";
import { type BoostFilters, type CameraBoostSettings, createCameraBoost } from "./camera-boost.usecase";
import type { ShowSceneResult } from "./show-director.usecase";

const PC = "Mic/Aux";
const CAMERA_1 = "Caméra du salon";
const CAMERA_2 = "Caméra de la cuisine";
const TARGET = -17;

// Tout ce que le boost touche, à la main : les levels d'OBS (le test les émet), ses filtres, le temps. Le test pose les réponses et lit
// les appels.
const setup = (overrides: Partial<CameraBoostSettings> = {}) => {
  const clock = { now: 0 };
  const timers: { at: number; callback: () => void }[] = [];
  const listeners = new Set<(input: string, level: number) => void>();
  const world = {
    filters: { ok: true, boostDb: 0 } as BoostFilters,
    updateResult: { ok: true } as ShowSceneResult,
  };
  const calls = { created: [] as string[], boosts: [] as string[] };
  const logs: string[] = [];
  const boost = createCameraBoost({
    levels: {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    port: {
      async createFilters(input) {
        calls.created.push(input);
        return world.filters;
      },
      async updateBoost(input, boostDb) {
        calls.boosts.push(`${input}:${boostDb}`);
        return world.updateResult;
      },
    },
    settings: { micName: PC, cameraBoostTarget: TARGET, ...overrides },
    schedule(callback, ms) {
      const timer = { at: clock.now + ms, callback };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    log: (line) => logs.push(line),
  });
  const flush = async () => {
    for (let turn = 0; turn < 60; turn += 1) await Promise.resolve();
  };
  // Le temps passe : les minuteries échues partent, dans l'ordre, et leurs suites se règlent.
  const advance = async (ms: number) => {
    clock.now += ms;
    for (const timer of timers.filter(({ at }) => at <= clock.now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.callback();
      await flush();
    }
  };
  // OBS lit `count` fois ce level sur cette entrée.
  const hear = (input: string, level: number, count = 40) => {
    for (let reading = 0; reading < count; reading += 1)
      for (const listener of listeners) listener(input, level);
  };
  return { boost, world, calls, logs, timers, listeners, flush, advance, hear };
};

// Alexis parle à une caméra dont la voix est `base` dB sans boost : chaque cycle, OBS lit sa voix avec le boost déjà posé.
const talkOneCycle = async (made: ReturnType<typeof setup>, input: string, base: number, boostDb: number) => {
  made.hear(input, base + boostDb);
  await made.advance(BOOST_PERIOD_MS);
};

const lastBoost = (made: ReturnType<typeof setup>): number => {
  const last = made.calls.boosts.at(-1);
  return last === undefined ? 0 : Number(last.slice(last.lastIndexOf(":") + 1));
};

describe("quand le micro du live est le PC", () => {
  it("ne fait rien : ni filtre posé ni boost, quelle que soit la voix", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(PC);
    await made.flush();
    made.hear(PC, -40);
    await made.advance(BOOST_PERIOD_MS * 5);
    expect(made.calls.created).toEqual([]);
    expect(made.calls.boosts).toEqual([]);
    expect(made.timers).toHaveLength(0);
  });

  it("n'a jamais touché au micro du PC, même après avoir boosté une caméra", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    await talkOneCycle(made, CAMERA_1, -27, 0);
    made.boost.updateLiveInput(PC);
    made.hear(PC, -40);
    await made.advance(BOOST_PERIOD_MS * 3);
    expect(made.calls.created).toEqual([CAMERA_1]);
    expect(made.calls.boosts.every((call) => call.startsWith(`${CAMERA_1}:`))).toBe(true);
  });
});

describe("quand le micro du live est une caméra", () => {
  it("pose les filtres de la caméra dès qu'elle a le micro du live, une seule fois pour la session", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    expect(made.calls.created).toEqual([CAMERA_1]);
    made.boost.updateLiveInput(PC);
    made.boost.updateLiveInput(CAMERA_1);
    await made.advance(BOOST_PERIOD_MS * 2);
    expect(made.calls.created).toEqual([CAMERA_1]);
  });

  it("ne fait rien sans cible réglée : pas même de limiteur", async () => {
    const made = setup({ cameraBoostTarget: undefined });
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    made.hear(CAMERA_1, -40);
    await made.advance(BOOST_PERIOD_MS * 3);
    expect(made.calls.created).toEqual([]);
    expect(made.calls.boosts).toEqual([]);
  });

  it("revoit le boost toutes les 2 s seulement, jamais plus tôt", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.hear(CAMERA_1, -27);
    await made.advance(BOOST_PERIOD_MS - 1);
    expect(made.calls.boosts).toEqual([]);
    await made.advance(1);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`]);
  });

  it("monte progressivement quand la voix est sous la cible, par crans qui se resserrent, puis s'arrête près de la cible", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    let boostDb = 0;
    for (let cycle = 0; cycle < 8; cycle += 1) {
      await talkOneCycle(made, CAMERA_1, -27, boostDb);
      boostDb = lastBoost(made);
    }
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`, `${CAMERA_1}:7.5`, `${CAMERA_1}:8.8`]);
  });

  it("ne dépasse jamais +30 dB, même avec une voix très faible, et ne redemande rien une fois au plafond", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    let boostDb = 0;
    for (let cycle = 0; cycle < 12; cycle += 1) {
      await talkOneCycle(made, CAMERA_1, -50, boostDb);
      boostDb = lastBoost(made);
    }
    expect(boostDb).toBe(BOOST_MAX_DB);
    const values = made.calls.boosts.map((call) => Number(call.slice(call.lastIndexOf(":") + 1)));
    expect(Math.max(...values)).toBe(BOOST_MAX_DB);
    expect(values.filter((value) => value === BOOST_MAX_DB)).toHaveLength(1);
  });

  it("ne tient pas compte des silences ni du bruit de fond : rien ne monte sous le plancher de -55 dB", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.hear(CAMERA_1, -80, 80);
    made.hear(CAMERA_1, -56, 80);
    await made.advance(BOOST_PERIOD_MS);
    expect(made.calls.boosts).toEqual([]);
  });

  it("ne juge pas sur moins d'une seconde de voix, même noyée dans du silence", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.hear(CAMERA_1, -30, 19);
    made.hear(CAMERA_1, -80, 300);
    await made.advance(BOOST_PERIOD_MS);
    expect(made.calls.boosts).toEqual([]);
    made.hear(CAMERA_1, -30, 20);
    await made.advance(BOOST_PERIOD_MS);
    expect(made.calls.boosts).toHaveLength(1);
  });

  it("ne monte pas quand la voix est déjà à la cible ou au-dessus, et ne baisse jamais le boost posé", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`]);
    await talkOneCycle(made, CAMERA_1, -5, 5);
    await talkOneCycle(made, CAMERA_1, -17, 5);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`]);
  });

  it("ne compte que les lectures de l'entrée du live : une autre caméra ou le PC qui parlent plus bas ne changent rien", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.hear(PC, -30);
    made.hear(CAMERA_2, -30);
    await made.advance(BOOST_PERIOD_MS);
    expect(made.calls.boosts).toEqual([]);
  });

  it("repart de lectures neuves quand le micro du live change de caméra, et garde le boost de chacune pour la session", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    await talkOneCycle(made, CAMERA_1, -27, 0);
    await talkOneCycle(made, CAMERA_1, -27, 5);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`, `${CAMERA_1}:7.5`]);
    made.hear(CAMERA_1, -40);
    made.boost.updateLiveInput(CAMERA_2);
    await made.flush();
    expect(made.calls.created).toEqual([CAMERA_1, CAMERA_2]);
    await talkOneCycle(made, CAMERA_2, -27, 0);
    expect(made.calls.boosts.at(-1)).toBe(`${CAMERA_2}:5`);
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    expect(made.calls.created).toEqual([CAMERA_1, CAMERA_2]);
    await talkOneCycle(made, CAMERA_1, -27, 7.5);
    expect(made.calls.boosts.at(-1)).toBe(`${CAMERA_1}:8.8`);
  });

  it("dit dans le journal le boost qui monte, avec les crêtes mesurées et la cible", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.logs).toContain(`Boost : « ${CAMERA_1} » prête, filtres en place (0 dB).`);
    expect(made.logs).toContain(
      `Boost : « ${CAMERA_1} » monte de 0 dB à +5 dB (crêtes -27 dB, cible -17 dB).`,
    );
  });
});

describe("le boost déjà posé dans OBS", () => {
  it("repart du boost que le filtre porte déjà, au lieu de retomber à 0 dB au redémarrage du serveur", async () => {
    const made = setup();
    made.world.filters = { ok: true, boostDb: 6 };
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    expect(made.calls.boosts).toEqual([]);
    await talkOneCycle(made, CAMERA_1, -27, 6);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:8`]);
  });

  it("ramène à 0 dB un filtre qu'Alexis a baissé à la main : le boost ne baisse jamais la voix", async () => {
    const made = setup();
    made.world.filters = { ok: true, boostDb: -5 };
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:0`]);
  });

  it("plafonne à 30 dB un filtre réglé au-dessus", async () => {
    const made = setup();
    made.world.filters = { ok: true, boostDb: 36 };
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:30`]);
  });
});

describe("quand OBS refuse", () => {
  it("dit une seule fois que la caméra n'est pas prête, réessaie à chaque cycle et monte dès que les filtres sont posés", async () => {
    const made = setup();
    made.world.filters = { ok: false, reason: "OBS n'est pas connecté" };
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    await talkOneCycle(made, CAMERA_1, -27, 0);
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.created.length).toBeGreaterThanOrEqual(3);
    expect(made.calls.boosts).toEqual([]);
    expect(made.logs.filter((line) => line.includes("n'est pas prête"))).toEqual([
      `Boost : « ${CAMERA_1} » n'est pas prête (OBS n'est pas connecté).`,
    ]);
    made.world.filters = { ok: true, boostDb: 0 };
    await made.advance(BOOST_PERIOD_MS);
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:5`]);
  });

  it("oublie le boost quand OBS refuse de le régler (filtre supprimé à la main), repose les filtres tout de suite et remonte ensuite", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.world.updateResult = { ok: false, reason: "OBS refuse de régler le boost" };
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.logs).toContain(
      `Boost : « ${CAMERA_1} » n'est pas montée à +5 dB (OBS refuse de régler le boost).`,
    );
    expect(made.calls.created).toEqual([CAMERA_1, CAMERA_1]);
    made.world.updateResult = { ok: true };
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.boosts.at(-1)).toBe(`${CAMERA_1}:5`);
    expect(made.calls.created).toEqual([CAMERA_1, CAMERA_1]);
  });
});

describe("les réglages et l'arrêt", () => {
  it("suit la cible du moment : retirée, le boost s'arrête ; remise, il reprend", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.boost.update({ micName: PC });
    expect(made.timers).toHaveLength(0);
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.boosts).toEqual([]);
    made.boost.update({ micName: PC, cameraBoostTarget: -20 });
    await talkOneCycle(made, CAMERA_1, -27, 0);
    expect(made.calls.boosts).toEqual([`${CAMERA_1}:3.5`]);
  });

  it("prend le nouveau nom du mic du PC pour le PC : son entrée n'est plus une caméra", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.boost.update({ micName: CAMERA_1, cameraBoostTarget: TARGET });
    made.boost.updateLiveInput(CAMERA_1);
    expect(made.timers).toHaveLength(0);
  });

  it("ne fait plus rien une fois arrêté : ni minuterie ni lecture", async () => {
    const made = setup();
    made.boost.start();
    made.boost.updateLiveInput(CAMERA_1);
    await made.flush();
    made.hear(CAMERA_1, -27);
    made.boost.stop();
    expect(made.listeners.size).toBe(0);
    expect(made.timers).toHaveLength(0);
    made.hear(CAMERA_1, -27);
    await made.advance(BOOST_PERIOD_MS * 3);
    expect(made.calls.boosts).toEqual([]);
  });

  it("ne s'abonne qu'une fois aux levels, même démarré deux fois", () => {
    const made = setup();
    made.boost.start();
    made.boost.start();
    expect(made.listeners.size).toBe(1);
  });
});
