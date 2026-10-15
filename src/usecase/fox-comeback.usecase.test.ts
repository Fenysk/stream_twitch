import { describe, expect, it } from "vitest";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { createFoxComeback } from "./fox-comeback.usecase";
import type { QueueItem } from "./fox-queue.usecase";

const MINUTE = 60_000;

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShouldHailComeback: true,
  foxComebackAfter: 5 * MINUTE,
  foxComebackToFenysk: ["F1", "F2"],
  foxComebackToChat: ["C1"],
};

// Un serveur à la main : l'heure, la voix de Fenysk (parle-t-il, depuis combien de ms il se tait) et les pas de 100 ms.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    silentFor: Number.POSITIVE_INFINITY,
    isTalking: false,
    tick: (): void => undefined,
    subscribers: 0,
  };
  const pushed: QueueItem[] = [];
  const logs: string[] = [];
  const comeback = createFoxComeback({
    queue: { push: (item) => pushed.push(item) },
    mode: {
      getVoice: () => ({ isTalking: state.isTalking, talkingFor: 0, silentFor: state.silentFor }),
      subscribe(listener) {
        state.tick = listener;
        state.subscribers += 1;
        return () => {
          state.tick = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  comeback.start();
  // Fenysk parle pendant `ms` (1 s par défaut ; 100 ms, une toux) : sa voix est au-dessus du seuil à chaque pas.
  const speak = (ms = 1000) => {
    for (let spent = 100; spent <= ms; spent += 100) {
      state.now += 100;
      state.silentFor = 0;
      state.isTalking = true;
      state.tick();
    }
    state.isTalking = false;
  };
  // Il se tait pendant `ms` : le silence grandit sans qu'il soit entendu.
  const stayAway = (ms: number) => {
    for (let spent = 100; spent <= ms; spent += 100) {
      state.now += 100;
      state.silentFor = spent;
      state.tick();
    }
  };
  return { comeback, state, pushed, logs, speak, stayAway };
};

describe("createFoxComeback : la première parole", () => {
  it("ne salue pas la première phrase après le démarrage, même après des heures sans l'entendre", () => {
    const { state, pushed, speak } = setup();
    for (let step = 0; step < 7200; step += 1) state.tick();
    speak();
    expect(pushed).toEqual([]);
  });

  it("compte une absence à partir de cette première parole", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(5 * MINUTE);
    speak();
    expect(pushed).toHaveLength(1);
  });
});

describe("createFoxComeback : le retour", () => {
  it("ne salue pas un silence de moins de 5 min, même à 1 s près", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(5 * MINUTE - 1000);
    speak();
    expect(pushed).toEqual([]);
  });

  it("salue au retour, pas pendant l'absence", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(20 * MINUTE);
    expect(pushed).toEqual([]);
    speak();
    expect(pushed).toHaveLength(1);
  });

  it("ne salue pas une mesure isolée (une toux, un bruit) : l'absence continue", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(6 * MINUTE);
    speak(100);
    stayAway(MINUTE);
    expect(pushed).toEqual([]);
    speak();
    expect(pushed).toHaveLength(1);
  });

  it("salue dès 1 s de voix, pas à 0,9 s", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(6 * MINUTE);
    speak(900);
    expect(pushed).toEqual([]);
    speak(100);
    expect(pushed).toHaveLength(1);
  });

  it("cumule la voix sur 3 s : 0,5 s, une pause de 1,5 s, puis 0,5 s suffisent, pas avec une pause de 3,5 s", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(6 * MINUTE);
    speak(500);
    stayAway(3500);
    speak(500);
    expect(pushed).toEqual([]);
    stayAway(1500);
    speak(500);
    expect(pushed).toHaveLength(1);
  });

  it("met la phrase en file comme un remerciement : urgente, jamais coupée par sa voix", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(5 * MINUTE);
    speak();
    expect(pushed[0]).toMatchObject({ kind: "comeback", text: "F1", isCuttable: false, isUrgent: true });
  });

  it("ne dit qu'une phrase par absence, même s'il continue de parler", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(8 * MINUTE);
    for (let step = 0; step < 600; step += 1) speak();
    expect(pushed).toHaveLength(1);
  });

  it("ne dit rien pour une pause de 2 min qui suit un retour : il faut une nouvelle absence de 5 min", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    stayAway(6 * MINUTE);
    speak();
    stayAway(2 * MINUTE);
    speak();
    expect(pushed).toHaveLength(1);
    stayAway(5 * MINUTE);
    speak();
    expect(pushed).toHaveLength(2);
  });

  it("écrit au journal la phrase qu'il va dire", () => {
    const { logs, speak, stayAway } = setup();
    speak();
    stayAway(12 * MINUTE);
    speak();
    expect(logs).toEqual(["Renard : Fenysk revient après 12 minutes d'absence, il le salue : « F1 »"]);
  });
});

describe("createFoxComeback : {absence}", () => {
  const withDuration: Settings = {
    ...settings,
    foxComebackToFenysk: ["{absence} d'absence, Fenysk. Tu nous racontes ?"],
    foxComebackToChat: [],
  };

  it("dit la durée de l'absence en minutes, au singulier à une minute", () => {
    const { pushed, speak, stayAway } = setup({ ...withDuration, foxComebackAfter: MINUTE });
    speak();
    stayAway(MINUTE);
    speak();
    stayAway(12 * MINUTE);
    speak();
    expect(pushed.map(({ text }) => text)).toEqual([
      "1 minute d'absence, Fenysk. Tu nous racontes ?",
      "12 minutes d'absence, Fenysk. Tu nous racontes ?",
    ]);
  });

  it("dit toute l'absence, même avec une toux au milieu", () => {
    const { pushed, speak, stayAway } = setup(withDuration);
    speak();
    stayAway(10 * MINUTE);
    speak(100);
    stayAway(2 * MINUTE);
    speak();
    expect(pushed.map(({ text }) => text)).toEqual(["12 minutes d'absence, Fenysk. Tu nous racontes ?"]);
  });

  it("dit une absence d'une heure en heures et minutes", () => {
    const { pushed, speak, stayAway } = setup(withDuration);
    speak();
    stayAway(70 * MINUTE);
    speak();
    expect(pushed.map(({ text }) => text)).toEqual(["1 heure 10 d'absence, Fenysk. Tu nous racontes ?"]);
  });

  it("remplace la variable aussi dans une phrase tournée vers le tchat", () => {
    const { pushed, speak, stayAway } = setup({
      ...settings,
      foxComebackToFenysk: [],
      foxComebackToChat: ["Il est parti {absence}."],
    });
    speak();
    stayAway(7 * MINUTE);
    speak();
    expect(pushed.map(({ text }) => text)).toEqual(["Il est parti 7 minutes."]);
  });
});

describe("createFoxComeback : les deux listes", () => {
  it("tire les deux listes ensemble sans répéter avant d'avoir tout dit, chacune avec son tournant", () => {
    const { pushed, speak, stayAway } = setup();
    speak();
    for (let comeback = 0; comeback < 4; comeback += 1) {
      stayAway(5 * MINUTE);
      speak();
    }
    expect(pushed.map(({ text }) => text)).toEqual(["F1", "F2", "C1", "F1"]);
    expect(pushed.map((item) => item.toShow())).toEqual([ADDRESS_MODE, ADDRESS_MODE, null, ADDRESS_MODE]);
  });

  it("ne dit rien quand les deux listes sont vides", () => {
    const { comeback, pushed, speak, stayAway } = setup();
    comeback.update({ ...settings, foxComebackToFenysk: [], foxComebackToChat: [] });
    speak();
    stayAway(10 * MINUTE);
    speak();
    expect(pushed).toEqual([]);
  });
});

describe("createFoxComeback : les réglages", () => {
  it("ne dit rien case décochée, mais suit l'absence : cocher pendant qu'il est parti salue son retour", () => {
    const { comeback, pushed, speak, stayAway } = setup({ ...settings, foxShouldHailComeback: false });
    speak();
    stayAway(6 * MINUTE);
    speak();
    expect(pushed).toEqual([]);
    stayAway(6 * MINUTE);
    comeback.update(settings);
    speak();
    expect(pushed).toHaveLength(1);
  });

  it("suit les réglages changés en direct : une durée plus courte, une autre liste", () => {
    const { comeback, pushed, speak, stayAway } = setup();
    comeback.update({
      ...settings,
      foxComebackAfter: MINUTE,
      foxComebackToFenysk: [],
      foxComebackToChat: ["Z"],
    });
    speak();
    stayAway(MINUTE);
    speak();
    expect(pushed.map(({ text }) => text)).toEqual(["Z"]);
    expect(pushed.map((item) => item.toShow())).toEqual([null]);
  });

  it("ne fait rien sans les réglages du renard", () => {
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.speak();
    none.stayAway(20 * MINUTE);
    none.speak();
    expect(none.pushed).toEqual([]);
  });

  it("ne s'abonne pas deux fois, et ne dit plus rien une fois arrêté", () => {
    const { comeback, state, pushed, speak, stayAway } = setup();
    comeback.start();
    expect(state.subscribers).toBe(1);
    speak();
    stayAway(6 * MINUTE);
    comeback.stop();
    expect(state.subscribers).toBe(0);
    speak();
    expect(pushed).toEqual([]);
  });
});
