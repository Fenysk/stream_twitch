import { describe, expect, it } from "vitest";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { createFoxBalance } from "./fox-balance.usecase";
import type { QueueItem } from "./fox-queue.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxBalanceMargin: 0,
  foxBalanceAfter: 10_000,
  foxBalanceGap: 300_000,
  foxBalanceAlerts: ["A", "B", "C"],
};

type Sound = { voice?: number | null; desktop?: number | null; isTalking?: boolean; silentFor?: number };

// Un serveur à la main : l'heure, le mic, le son du PC, ce que le renard sait de la voix de Fenysk, et les pas de 100 ms.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    isTalking: true,
    silentFor: 0,
    mic: (_level: number): void => undefined,
    desktop: (_level: number): void => undefined,
    tick: (): void => undefined,
    subscribers: 0,
  };
  const pushed: QueueItem[] = [];
  const logs: string[] = [];
  const subscribe = (key: "mic" | "desktop" | "tick") => (listener: never) => {
    state[key] = listener;
    state.subscribers += 1;
    return () => {
      state[key] = () => undefined;
      state.subscribers -= 1;
    };
  };
  const balance = createFoxBalance({
    mic: { subscribe: subscribe("mic") },
    desktop: { subscribe: subscribe("desktop") },
    queue: { push: (item) => pushed.push(item) },
    mode: {
      getVoice: () => ({ isTalking: state.isTalking, talkingFor: 0, silentFor: state.silentFor }),
      subscribe: subscribe("tick"),
    },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  balance.start();
  // `ms` de son : à chaque pas de 100 ms, le mic et le son du PC envoient leur level (null : rien), puis le renard compte.
  const play = (ms: number, { voice = -20, desktop = -20, isTalking = true, silentFor = 0 }: Sound = {}) => {
    state.isTalking = isTalking;
    for (let spent = 0; spent < ms; spent += 100) {
      if (voice !== null) state.mic(voice);
      if (desktop !== null) state.desktop(desktop);
      state.now += 100;
      state.silentFor = isTalking ? 0 : silentFor + spent;
      state.tick();
    }
  };
  return { balance, state, pushed, logs, play };
};

describe("createFoxBalance : l'alerte", () => {
  it("alerte quand le son du PC est aussi fort que la voix pendant 10 s de parole", () => {
    const { play, pushed } = setup();
    play(10_000);
    expect(pushed).toEqual([]);
    play(200);
    expect(pushed).toHaveLength(1);
  });

  it("met l'alerte en file comme un remerciement : urgente, jamais coupée par la voix, tournée vers Fenysk", () => {
    const { play, pushed } = setup();
    play(11_000);
    expect(pushed[0]).toMatchObject({ kind: "balance", text: "A", isCuttable: false, isUrgent: true });
    expect(pushed[0]?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("écrit au journal l'alerte qu'il va dire", () => {
    const { play, logs } = setup();
    play(11_000);
    expect(logs).toEqual(["Renard : le son du PC couvre la voix de Fenysk : « A »"]);
  });

  it("alerte quand le son du PC est plus fort que la voix", () => {
    const { play, pushed } = setup();
    play(11_000, { voice: -25, desktop: -10 });
    expect(pushed).toHaveLength(1);
  });

  it("n'alerte pas tant que la voix reste au-dessus du son du PC", () => {
    const { play, pushed } = setup();
    play(120_000, { voice: -14, desktop: -20 });
    expect(pushed).toEqual([]);
  });

  it("compare les pics lissés : une voix qui reprend son souffle entre deux mots garde son pic devant un jeu régulier", () => {
    const { play, pushed } = setup();
    for (let word = 0; word < 100; word += 1) {
      play(100, { voice: -14, desktop: -20 });
      play(300, { voice: -45, desktop: -20 });
    }
    expect(pushed).toEqual([]);
  });

  it("n'alerte jamais quand Fenysk se tait : un jeu fort est normal", () => {
    const { play, pushed } = setup();
    play(600_000, { voice: -90, desktop: -5, isTalking: false, silentFor: 1000 });
    expect(pushed).toEqual([]);
  });

  it("n'alerte pas sans son du PC", () => {
    const { play, pushed } = setup();
    play(60_000, { desktop: null });
    expect(pushed).toEqual([]);
  });

  it("repart de zéro dès que la voix repasse devant le jeu", () => {
    const { play, pushed } = setup();
    play(8000);
    play(100, { voice: -5, desktop: -20 });
    play(8000, { voice: -20, desktop: -20 });
    expect(pushed).toEqual([]);
  });

  it("cumule la parole de plusieurs morceaux, un silence de Fenysk au milieu ne perd rien", () => {
    const { play, pushed } = setup();
    play(6000);
    play(3000, { voice: -90, desktop: -5, isTalking: false, silentFor: 1000 });
    expect(pushed).toEqual([]);
    play(4500);
    expect(pushed).toHaveLength(1);
  });

  it("oublie le compte après un silence de Fenysk de plus de 10 s", () => {
    const { play, pushed } = setup();
    play(8000);
    play(12_000, { voice: -90, desktop: -5, isTalking: false, silentFor: 0 });
    play(8000);
    expect(pushed).toEqual([]);
  });

  it("tient compte de l'écart réglé", () => {
    const { balance, play, pushed } = setup();
    balance.update({ ...settings, foxBalanceMargin: 6 });
    play(30_000, { voice: -20, desktop: -16 });
    expect(pushed).toEqual([]);
    play(11_000, { voice: -20, desktop: -13 });
    expect(pushed).toHaveLength(1);
  });
});

describe("createFoxBalance : la fréquence et les réglages", () => {
  it("au plus une alerte toutes les 5 min, même si le jeu couvre la voix sans arrêt", () => {
    const { play, pushed } = setup();
    play(280_000);
    expect(pushed).toHaveLength(1);
    play(40_000);
    expect(pushed).toHaveLength(2);
  });

  it("dit les alertes dans l'ordre sans répéter avant d'avoir tout dit", () => {
    const { play, pushed } = setup();
    play(4 * 300_000 + 10_000);
    expect(pushed.map(({ text }) => text)).toEqual(["A", "B", "C", "A"]);
  });

  it("ne dit rien avec une liste vide, ni sans les réglages du renard", () => {
    const empty = setup({ ...settings, foxBalanceAlerts: [] });
    empty.play(60_000);
    expect(empty.pushed).toEqual([]);
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.play(60_000);
    expect(none.pushed).toEqual([]);
  });

  it("suit les réglages changés en direct : une durée plus courte, une autre liste", () => {
    const { balance, play, pushed } = setup();
    balance.update({ ...settings, foxBalanceAfter: 3000, foxBalanceAlerts: ["Z"] });
    play(3500);
    expect(pushed.map(({ text }) => text)).toEqual(["Z"]);
  });

  it("se désabonne des trois flux à l'arrêt, et ne s'abonne pas deux fois au démarrage", () => {
    const { balance, state } = setup();
    balance.start();
    expect(state.subscribers).toBe(3);
    balance.stop();
    expect(state.subscribers).toBe(0);
  });
});
