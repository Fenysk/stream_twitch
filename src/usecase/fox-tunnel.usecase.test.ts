import { describe, expect, it } from "vitest";
import { ADDRESS_MODE, type Show, YAWN_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { QueueItem } from "./fox-queue.usecase";
import { createFoxTunnel } from "./fox-tunnel.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxTunnelAfter: 180_000,
  foxTunnelPause: 5000,
  foxTunnelGap: 600_000,
  foxTunnelToFenysk: ["F1", "F2"],
  foxTunnelToChat: ["C1"],
};

// Un serveur à la main : l'heure, la voix de Fenysk, les pas de 100 ms, le bâillement et les minuteurs.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    silentFor: 0,
    yawnMs: 2000,
    wakes: 0,
    tick: (): void => undefined,
    subscribers: 0,
  };
  const pushed: QueueItem[] = [];
  const flashes: Show[] = [];
  const logs: string[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const tunnel = createFoxTunnel({
    queue: { push: (item) => pushed.push(item) },
    mode: {
      getVoice: () => ({ isTalking: state.silentFor < 250, talkingFor: 0, silentFor: state.silentFor }),
      subscribe(listener) {
        state.tick = listener;
        state.subscribers += 1;
        return () => {
          state.tick = () => undefined;
          state.subscribers -= 1;
        };
      },
      wake() {
        state.wakes += 1;
        return 0;
      },
      flash(show) {
        flashes.push(show);
        return state.yawnMs;
      },
    },
    settings: custom,
    clock: () => state.now,
    schedule(callback, ms) {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    random: () => 0,
    log: (line) => logs.push(line),
  });
  tunnel.start();
  // Fenysk parle `ms` sans s'arrêter : un pas de 1 s à chaque seconde, le premier à l'instant où il commence.
  const talk = (ms: number) => {
    state.silentFor = 0;
    state.tick();
    for (let spent = 0; spent < ms; spent += 1000) {
      state.silentFor = 0;
      state.now += 1000;
      state.tick();
    }
  };
  const runTimers = () => {
    for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
  };
  return {
    tunnel,
    state,
    pushed,
    flashes,
    logs,
    talk,
    runTimers,
    pending: () => timers.filter((t) => !t.isCancelled),
  };
};

describe("createFoxTunnel : le bâillement", () => {
  it("bâille quand Fenysk parle depuis 3 min, pas avant", () => {
    const { talk, flashes } = setup();
    talk(179_000);
    expect(flashes).toEqual([]);
    talk(1000);
    expect(flashes).toEqual([YAWN_MODE]);
  });

  it("ne dit sa phrase qu'une fois le bâillement fini", () => {
    const { talk, state, flashes, pushed, runTimers } = setup();
    talk(180_000);
    expect(flashes).toHaveLength(1);
    expect(pushed).toEqual([]);
    state.now += 1999;
    runTimers();
    expect(pushed).toEqual([]);
    state.now += 1;
    runTimers();
    expect(pushed).toHaveLength(1);
  });

  it("dit la phrase tout de suite, sans bâiller, quand il est caché (le contrôleur ne montre rien)", () => {
    const { talk, state, pushed } = setup();
    state.yawnMs = 0;
    talk(180_000);
    expect(pushed).toHaveLength(1);
  });

  it("met la phrase en file comme un remerciement : urgente, jamais coupée par la voix", () => {
    const { talk, state, pushed, runTimers } = setup();
    talk(180_000);
    state.now += 2000;
    runTimers();
    expect(pushed[0]).toMatchObject({ kind: "tunnel", text: "F1", isCuttable: false, isUrgent: true });
  });

  it("le réveille d'abord : il reste là ou revient, son délai avant de partir repart", () => {
    const { talk, state } = setup();
    talk(179_000);
    expect(state.wakes).toBe(0);
    talk(1000);
    expect(state.wakes).toBe(1);
  });

  it("écrit au journal la phrase qu'il va dire", () => {
    const { talk, logs } = setup();
    talk(180_000);
    expect(logs).toEqual(["Renard : Fenysk parle sans s'arrêter, il le fait remarquer : « F1 »"]);
  });
});

describe("createFoxTunnel : le tunnel", () => {
  it("se coupe après un silence de plus de 5 s : les 3 min repartent de zéro", () => {
    const { talk, state, flashes } = setup();
    talk(170_000);
    state.silentFor = 5001;
    state.now += 1000;
    state.tick();
    talk(170_000);
    expect(flashes).toEqual([]);
    talk(10_000);
    expect(flashes).toHaveLength(1);
  });

  it("continue après une pause de 5 s au plus", () => {
    const { talk, state, flashes } = setup();
    talk(100_000);
    state.silentFor = 5000;
    state.now += 5000;
    state.tick();
    talk(80_000);
    expect(flashes).toHaveLength(1);
  });

  it("ne bâille jamais quand Fenysk se tait", () => {
    const { state, flashes } = setup();
    state.silentFor = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 600; step += 1) {
      state.now += 1000;
      state.tick();
    }
    expect(flashes).toEqual([]);
  });

  it("repart de zéro après un tunnel, et attend l'écart de 10 min pour le suivant", () => {
    const { talk, state, flashes, pushed, runTimers } = setup();
    talk(180_000);
    state.now += 2000;
    runTimers();
    talk(597_000);
    expect(flashes).toHaveLength(1);
    talk(1000);
    expect(flashes).toHaveLength(2);
    expect(pushed).toHaveLength(1);
  });

  it("tire les deux listes ensemble sans répéter avant d'avoir tout dit, chacune avec son tournant", () => {
    const { talk, state, pushed, runTimers } = setup();
    for (let tunnel = 0; tunnel < 4; tunnel += 1) {
      talk(600_000);
      state.now += 2000;
      runTimers();
    }
    expect(pushed.map(({ text }) => text)).toEqual(["F1", "F2", "C1", "F1"]);
    expect(pushed.map((item) => item.toShow())).toEqual([ADDRESS_MODE, ADDRESS_MODE, null, ADDRESS_MODE]);
  });

  it("ne dit rien, et ne bâille pas, quand les deux listes sont vides", () => {
    const { tunnel, talk, flashes, pushed } = setup();
    tunnel.update({ ...settings, foxTunnelToFenysk: [], foxTunnelToChat: [] });
    talk(400_000);
    expect(flashes).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it("suit les réglages changés en direct : une durée plus courte, une autre liste", () => {
    const { tunnel, talk, state, pushed, runTimers } = setup();
    tunnel.update({ ...settings, foxTunnelAfter: 30_000, foxTunnelToFenysk: [], foxTunnelToChat: ["Z"] });
    talk(30_000);
    state.now += 2000;
    runTimers();
    expect(pushed.map((item) => item.toShow())).toEqual([null]);
    expect(pushed.map(({ text }) => text)).toEqual(["Z"]);
  });

  it("ne fait rien sans les réglages du renard", () => {
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.talk(400_000);
    expect(none.flashes).toEqual([]);
  });

  it("annule la phrase qui attend la fin du bâillement à l'arrêt, et ne s'abonne pas deux fois", () => {
    const { tunnel, talk, state, pushed, runTimers, pending } = setup();
    tunnel.start();
    expect(state.subscribers).toBe(1);
    talk(180_000);
    expect(pending()).toHaveLength(1);
    tunnel.stop();
    expect(state.subscribers).toBe(0);
    expect(pending()).toHaveLength(0);
    state.now += 5000;
    runTimers();
    expect(pushed).toEqual([]);
  });
});
