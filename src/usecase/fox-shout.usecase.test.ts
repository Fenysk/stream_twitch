import { describe, expect, it } from "vitest";
import { ADDRESS_MODE, FLINCH_MODE, type Show } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { QueueItem } from "./fox-queue.usecase";
import { createFoxShout } from "./fox-shout.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShoutThreshold: -5,
  foxShoutMerge: 1000,
  foxShoutCount: 3,
  foxShoutPeriod: 120_000,
  foxShoutLong: 3000,
  foxShoutGap: 600_000,
  foxShouts: ["A", "B", "C"],
};

const SHOUT = -3;
const VOICE = -12;

// Un serveur à la main : l'heure, la présence du renard, le micro et ce que le renard montre ou dit.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    presence: { kind: "visible" as "visible" | "leaving" | "away" | "returning", elapsed: 0 },
    hear: (_level: number): void => undefined,
    subscribers: 0,
  };
  const pushed: QueueItem[] = [];
  const flashes: Show[] = [];
  const logs: string[] = [];
  const shout = createFoxShout({
    mic: {
      subscribe(listener) {
        state.hear = listener;
        state.subscribers += 1;
        return () => {
          state.hear = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    queue: { push: (item) => pushed.push(item) },
    mode: {
      flash(show) {
        flashes.push(show);
        return 1000;
      },
    },
    fox: { getPresence: () => state.presence },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  shout.start();
  // Un cri de `ms` : un level de cri toutes les 50 ms, comme le flux du micro d'OBS.
  const cry = (ms = 0) => {
    for (let spent = 0; spent <= ms; spent += 50) {
      state.hear(SHOUT);
      if (spent < ms) state.now += 50;
    }
  };
  return { shout, state, pushed, flashes, logs, cry };
};

describe("createFoxShout : le sursaut", () => {
  it("sursaute à un cri quand il est visible, sans rien dire", () => {
    const { cry, flashes, pushed } = setup();
    cry();
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(pushed).toEqual([]);
  });

  it("ne sursaute pas pour une voix forte, ni pour un level pile sur le seuil de cri", () => {
    const { state, flashes } = setup();
    state.hear(VOICE);
    state.hear(-5);
    expect(flashes).toEqual([]);
    state.hear(-4.9);
    expect(flashes).toHaveLength(1);
  });

  it("ne sursaute qu'une fois pour deux passages à moins d'1 s d'écart", () => {
    const { state, flashes, cry } = setup();
    cry();
    state.now += 999;
    cry();
    expect(flashes).toHaveLength(1);
  });

  it("sursaute de nouveau à chaque cri séparé de plus d'1 s", () => {
    const { state, flashes, cry } = setup();
    cry();
    state.now += 1000;
    cry();
    expect(flashes).toHaveLength(2);
  });

  it("garde un cri tant que les passages s'enchaînent à moins d'1 s : un seul sursaut pour un cri de 5 s", () => {
    const { flashes, cry } = setup();
    cry(5000);
    expect(flashes).toHaveLength(1);
  });

  it("ne sursaute pas caché, parti, en train de partir ou de revenir : le cri ne compte pas", () => {
    const { state, flashes, cry } = setup();
    for (const kind of ["away", "leaving", "returning"] as const) {
      state.presence = { kind, elapsed: 500 };
      cry();
      state.now += 2000;
    }
    expect(flashes).toEqual([]);
  });

  it("n'écrit rien au journal pour un simple sursaut", () => {
    const { logs, cry } = setup();
    cry();
    expect(logs).toEqual([]);
  });
});

describe("createFoxShout : la phrase d'un cri pénible", () => {
  it("dit une phrase au troisième cri en 2 min, pas au deuxième", () => {
    const { state, pushed, cry } = setup();
    cry();
    state.now += 30_000;
    cry();
    expect(pushed).toEqual([]);
    state.now += 30_000;
    cry();
    expect(pushed).toHaveLength(1);
  });

  it("met la phrase en file comme un remerciement : urgente, jamais coupée par la voix, tournée vers Fenysk", () => {
    const { state, pushed, cry } = setup();
    for (let index = 0; index < 3; index += 1) {
      cry();
      state.now += 10_000;
    }
    expect(pushed[0]).toMatchObject({ kind: "shout", text: "A", isCuttable: false, isUrgent: true });
    expect(pushed[0]?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("n'en compte pas trois dont le premier date de plus de 2 min", () => {
    const { state, pushed, cry } = setup();
    cry();
    state.now += 60_000;
    cry();
    state.now += 60_000;
    cry();
    expect(pushed).toEqual([]);
  });

  it("dit une phrase quand un cri dure plus de 3 s, au passage des 3 s, pas avant", () => {
    const { state, pushed, cry } = setup();
    cry(3000);
    expect(pushed).toEqual([]);
    state.now += 50;
    cry();
    expect(pushed).toHaveLength(1);
  });

  it("ne dit qu'une phrase pour un cri qui dure 10 s : l'écart de 10 min la retient", () => {
    const { cry, pushed } = setup();
    cry(10_000);
    expect(pushed).toHaveLength(1);
  });

  it("au plus une phrase toutes les 10 min, quel que soit le nombre de cris pénibles", () => {
    const { state, pushed, cry } = setup();
    cry(4000);
    expect(pushed).toHaveLength(1);
    state.now += 580_000;
    cry(4000);
    expect(pushed).toHaveLength(1);
    state.now += 30_000;
    cry(4000);
    expect(pushed).toHaveLength(2);
  });

  it("dit les phrases dans l'ordre sans répéter avant d'avoir tout dit", () => {
    const { state, pushed, cry } = setup();
    for (let index = 0; index < 4; index += 1) {
      state.now += 600_000;
      cry(4000);
    }
    expect(pushed.map(({ text }) => text)).toEqual(["A", "B", "C", "A"]);
  });

  it("écrit au journal la phrase qu'il va dire", () => {
    const { logs, cry } = setup();
    cry(4000);
    expect(logs).toEqual(["Renard : Fenysk crie, il proteste : « A »"]);
  });

  it("sursaute sans parler quand la liste est vide", () => {
    const { shout, state, flashes, pushed, cry } = setup();
    shout.update({ ...settings, foxShouts: [] });
    state.now += 1;
    cry(4000);
    expect(flashes).toHaveLength(1);
    expect(pushed).toEqual([]);
  });

  it("ne compte pas un cri commencé caché, même si le renard revient pendant le cri", () => {
    const { state, pushed, flashes, cry } = setup();
    state.presence = { kind: "away", elapsed: 500 };
    cry(1000);
    state.presence = { kind: "visible", elapsed: 0 };
    cry(4000);
    expect(flashes).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it("suit les réglages changés en direct : 2 cris suffisent, une autre liste, un autre seuil", () => {
    const { shout, state, pushed, flashes } = setup();
    shout.update({ ...settings, foxShoutCount: 2, foxShoutThreshold: -20, foxShouts: ["Z"] });
    state.hear(-10);
    expect(flashes).toHaveLength(1);
    state.now += 5000;
    state.hear(-10);
    expect(pushed.map(({ text }) => text)).toEqual(["Z"]);
  });

  it("ne fait rien sans les réglages du renard", () => {
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.cry(5000);
    expect(none.flashes).toEqual([]);
    expect(none.pushed).toEqual([]);
  });

  it("se désabonne à l'arrêt, et ne s'abonne pas deux fois au démarrage", () => {
    const { shout, state } = setup();
    shout.start();
    expect(state.subscribers).toBe(1);
    shout.stop();
    expect(state.subscribers).toBe(0);
  });
});
