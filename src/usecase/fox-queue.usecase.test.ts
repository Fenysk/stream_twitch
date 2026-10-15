import { describe, expect, it } from "vitest";
import type { Show } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { SpeakPlan, SpeakResult } from "./fox.usecase";
import type { FoxModeController, Intro, VoiceView } from "./fox-mode.usecase";
import { createFoxQueue, type QueueItem } from "./fox-queue.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxReadSilence: 1000,
  foxStopAfter: 1000,
  foxReactionDuration: 1000,
  foxJoyDuration: 800,
  foxYawnDuration: 2000,
  foxRaidDuration: 3000,
  foxAwayAfter: 180_000,
  foxCrouchDuration: 300,
  foxJumpDuration: 400,
  foxDiveDuration: 800,
  foxReturnDuration: 800,
};

type Spoken = { text: string; isCancelled: () => boolean; settle: (result: SpeakResult) => void };

// Une horloge et un programmateur à la main ; la voix d'Alexis se règle à la main aussi (au départ il se tait depuis toujours).
const setup = (custom: Partial<Settings> = {}) => {
  const voice: VoiceView = { isTalking: false, talkingFor: 0, silentFor: Number.POSITIVE_INFINITY };
  const calls = { wakes: 0, spokes: 0, intros: [] as { show: Show | null; isCancelled: boolean }[] };
  const state = { now: 0, tick: (): void => undefined, subscribers: 0 };
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const logs: string[] = [];
  const spoken: Spoken[] = [];
  const stops = { count: 0 };
  const mode: Pick<FoxModeController, "getVoice" | "wake" | "noteSpoke" | "introduce" | "subscribe"> = {
    getVoice: () => ({ ...voice }),
    wake() {
      calls.wakes += 1;
      return 0;
    },
    noteSpoke() {
      calls.spokes += 1;
    },
    introduce(show): Intro {
      const intro = { show, isCancelled: false };
      calls.intros.push(intro);
      return {
        ready: Promise.resolve(),
        cancel() {
          intro.isCancelled = true;
        },
      };
    },
    subscribe(listener) {
      state.tick = listener;
      state.subscribers += 1;
      return () => {
        state.tick = () => undefined;
        state.subscribers -= 1;
      };
    },
  };
  const fox = {
    speak: (text: string, plan?: SpeakPlan) =>
      new Promise<SpeakResult>((resolve) => {
        spoken.push({ text, isCancelled: plan?.isCancelled ?? (() => false), settle: resolve });
      }),
    stop() {
      stops.count += 1;
    },
  };
  const queue = createFoxQueue({
    fox,
    mode,
    settings: { ...settings, ...custom },
    clock: () => state.now,
    schedule: (callback, ms) => {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
  });
  queue.start();
  const flush = async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  };
  return {
    queue,
    voice,
    calls,
    spoken,
    stops,
    logs,
    subscribers: () => state.subscribers,
    pendingTimers: () => timers.filter(({ isCancelled }) => !isCancelled).length,
    tick: async () => {
      state.tick();
      await flush();
    },
    // La synthèse du n-ième texte finit : la phrase part, et dure `durationMs`.
    finishSynthesis: async (index: number, durationMs = 1000) => {
      spoken[index]?.settle({ ok: true, url: `/s/${index}`, durationMs });
      await flush();
    },
    advance: async (ms: number) => {
      state.now += ms;
      for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
        timer.isCancelled = true;
        timer.callback();
      }
      await flush();
    },
    flush,
  };
};

const item = (text: string, overrides: Partial<QueueItem> = {}): QueueItem => ({
  kind: "message",
  label: `message de ${text}`,
  text,
  isCuttable: true,
  isUrgent: false,
  toShow: () => null,
  ...overrides,
});

const thanks = (text: string): QueueItem =>
  item(text, { kind: "thanks", label: `remerciement ${text}`, isCuttable: false, isUrgent: true });

const talking = (voice: VoiceView, talkingFor: number) =>
  Object.assign(voice, { isTalking: true, talkingFor, silentFor: 0 });

describe("createFoxQueue : l'ordre", () => {
  it("dit tout de suite la première entrée quand Alexis se tait, et réveille le renard", async () => {
    const { queue, spoken, calls, flush } = setup();
    queue.push(item("un"));
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["un"]);
    expect(calls.wakes).toBe(1);
  });

  it("garde l'ordre d'arrivée pour les messages, une entrée à la fois", async () => {
    const { queue, spoken, finishSynthesis, advance } = setup();
    for (const text of ["un", "deux", "trois"]) queue.push(item(text));
    expect(spoken).toHaveLength(1);
    await finishSynthesis(0);
    await advance(1400);
    await finishSynthesis(1);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["un", "deux", "trois"]);
  });

  it("fait passer un remerciement devant les messages qui attendent, jamais devant celui qu'on dit", async () => {
    const { queue, spoken, finishSynthesis, advance } = setup();
    queue.push(item("en cours"));
    queue.push(item("attend un"));
    queue.push(item("attend deux"));
    queue.push(thanks("merci"));
    expect(spoken.map(({ text }) => text)).toEqual(["en cours"]);
    await finishSynthesis(0);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["en cours", "merci"]);
    await finishSynthesis(1);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["en cours", "merci", "attend un"]);
  });

  it("garde l'ordre d'arrivée entre deux remerciements", async () => {
    const { queue, spoken, finishSynthesis, advance } = setup();
    queue.push(item("en cours"));
    queue.push(item("message"));
    queue.push(thanks("merci un"));
    queue.push(thanks("merci deux"));
    await finishSynthesis(0);
    await advance(1400);
    await finishSynthesis(1);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["en cours", "merci un", "merci deux"]);
  });

  it("montre ce que l'entrée demande, au moment où elle commence", async () => {
    const { queue, calls, flush } = setup();
    queue.push(item("un", { toShow: () => ({ kind: "wave" }) }));
    await flush();
    expect(calls.intros.map(({ show }) => show)).toEqual([{ kind: "wave" }]);
  });

  it("marque la fin de sa phrase au renard", async () => {
    const { queue, calls, finishSynthesis, advance } = setup();
    queue.push(item("un"));
    await finishSynthesis(0);
    await advance(1400);
    expect(calls.spokes).toBe(1);
    expect(calls.intros[0]?.isCancelled).toBe(true);
  });

  it("rend la main à l'entrée une fois sa phrase finie, et pas avant", async () => {
    const { queue, finishSynthesis, advance } = setup();
    const done: string[] = [];
    queue.push(item("un", { onDone: () => done.push("un") }));
    await finishSynthesis(0, 1000);
    await advance(1399);
    expect(done).toEqual([]);
    await advance(1);
    expect(done).toEqual(["un"]);
  });

  it("rend la main aussi quand la phrase n'a pas pu être dite", async () => {
    const { queue, spoken, flush } = setup();
    const done: string[] = [];
    queue.push(item("un", { onDone: () => done.push("un") }));
    spoken[0]?.settle({ ok: false, status: 502, message: "la synthèse a échoué" });
    await flush();
    expect(done).toEqual(["un"]);
  });

  it("dit à l'entrée si sa phrase a été dite : vrai une fois finie, faux quand la synthèse a échoué", async () => {
    const { queue, spoken, finishSynthesis, advance, flush } = setup();
    const wasSaid: boolean[] = [];
    queue.push(item("un", { onDone: (isSaid) => wasSaid.push(isSaid) }));
    queue.push(item("deux", { onDone: (isSaid) => wasSaid.push(isSaid) }));
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(wasSaid).toEqual([true]);
    spoken[1]?.settle({ ok: false, status: 502, message: "la synthèse a échoué" });
    await flush();
    expect(wasSaid).toEqual([true, false]);
  });

  it("ne rend jamais la main à une entrée retirée ou coupée par la voix d'Alexis", async () => {
    const { queue, voice, spoken, finishSynthesis, tick } = setup();
    const done: string[] = [];
    queue.push(item("un", { messageId: "m1", onDone: () => done.push("un") }));
    await finishSynthesis(0);
    talking(voice, 2000);
    await tick();
    queue.push(item("deux", { messageId: "m2", onDone: () => done.push("deux") }));
    queue.removeWhere(({ messageId }) => messageId === "m2");
    expect(spoken.length).toBeGreaterThan(0);
    expect(done).toEqual([]);
  });

  it("garde le départ de la file en ordre : l'entrée suivante part après la main rendue", async () => {
    const { queue, spoken, finishSynthesis, advance } = setup();
    const order: string[] = [];
    queue.push(item("un", { onDone: () => order.push(`done un, ${spoken.length} dite`) }));
    queue.push(item("deux"));
    await finishSynthesis(0);
    await advance(1400);
    expect(order).toEqual(["done un, 1 dite"]);
    expect(spoken.map(({ text }) => text)).toEqual(["un", "deux"]);
  });
});

describe("createFoxQueue : Alexis parle (D)", () => {
  it("attend qu'Alexis se taise depuis 1 s, y compris pour un remerciement", async () => {
    const { queue, voice, spoken, tick } = setup();
    Object.assign(voice, { isTalking: false, talkingFor: 0, silentFor: 999 });
    queue.push(thanks("merci"));
    await tick();
    expect(spoken).toEqual([]);
    voice.silentFor = 1000;
    await tick();
    expect(spoken.map(({ text }) => text)).toEqual(["merci"]);
  });

  it("coupe un message quand Alexis parle plus d'1 s, et ne le reprend jamais", async () => {
    const { queue, voice, spoken, stops, logs, finishSynthesis, tick, advance } = setup();
    queue.push(item("un"));
    await finishSynthesis(0, 5000);
    talking(voice, 1001);
    await tick();
    expect(stops.count).toBe(1);
    expect(logs).toEqual(["Renard : lecture abandonnée, Alexis parle (message de un)."]);
    Object.assign(voice, { isTalking: false, talkingFor: 0, silentFor: 9000 });
    await advance(60_000);
    await tick();
    expect(spoken).toHaveLength(1);
  });

  it("ne coupe pas un remerciement, même quand Alexis parle longtemps", async () => {
    const { queue, voice, spoken, stops, finishSynthesis, tick } = setup();
    queue.push(thanks("merci"));
    await finishSynthesis(0, 5000);
    talking(voice, 4000);
    await tick();
    expect(stops.count).toBe(0);
    expect(spoken).toHaveLength(1);
  });

  it("garde le renard là tant qu'une entrée attend", async () => {
    const { queue, voice, calls, tick } = setup();
    talking(voice, 300);
    queue.push(item("un"));
    expect(calls.wakes).toBe(1);
    await tick();
    await tick();
    expect(calls.wakes).toBe(3);
  });

  it("annule la phrase et l'entrée en scène quand Alexis parle plus d'1 s avant qu'elle parte", async () => {
    const { queue, voice, spoken, calls, tick } = setup();
    queue.push(item("un"));
    talking(voice, 1001);
    await tick();
    expect(spoken[0]?.isCancelled()).toBe(true);
    expect(calls.intros[0]?.isCancelled).toBe(true);
  });
});

describe("createFoxQueue : retirer, compter, arrêter", () => {
  it("compte les entrées qui répondent au critère, celle qu'on dit comprise", async () => {
    const { queue, flush } = setup();
    queue.push(item("un"));
    queue.push(thanks("merci"));
    queue.push(item("deux"));
    await flush();
    expect(queue.count(({ kind }) => kind === "message")).toBe(2);
    expect(queue.count(({ kind }) => kind === "thanks")).toBe(1);
    expect(queue.count(() => true)).toBe(3);
  });

  it("retire une entrée qui attend, et l'écrit au journal quand on donne la cause", async () => {
    const { queue, logs, flush } = setup();
    queue.push(item("un"));
    queue.push(item("deux", { messageId: "m2" }));
    await flush();
    queue.removeWhere(({ messageId }) => messageId === "m2", "supprimé par la modération");
    expect(logs).toEqual(["Renard : message de deux retiré de la file (supprimé par la modération)."]);
    expect(queue.count(() => true)).toBe(1);
  });

  it("retire sans rien écrire quand on ne donne pas de cause", async () => {
    const { queue, logs, flush } = setup();
    queue.push(item("un"));
    queue.push(item("deux"));
    await flush();
    queue.removeWhere(({ text }) => text === "deux");
    expect(logs).toEqual([]);
    expect(queue.count(() => true)).toBe(1);
  });

  it("arrête la lecture de l'entrée retirée quand sa phrase est partie, et passe à la suivante", async () => {
    const { queue, spoken, stops, logs, finishSynthesis } = setup();
    queue.push(item("un", { messageId: "m1" }));
    queue.push(item("deux"));
    await finishSynthesis(0, 5000);
    queue.removeWhere(({ messageId }) => messageId === "m1", "viewer banni ou en timeout");
    expect(stops.count).toBe(1);
    expect(logs).toEqual(["Renard : lecture arrêtée, message de un retiré (viewer banni ou en timeout)."]);
    expect(spoken.map(({ text }) => text)).toEqual(["un", "deux"]);
  });

  it("n'arrête rien quand l'entrée retirée n'était pas encore partie : la phrase est annulée", async () => {
    const { queue, spoken, stops } = setup();
    queue.push(item("un", { messageId: "m1" }));
    queue.removeWhere(({ messageId }) => messageId === "m1");
    expect(spoken[0]?.isCancelled()).toBe(true);
    expect(stops.count).toBe(0);
  });

  it("à l'arrêt, se désabonne, vide la file et arrête la lecture en cours", async () => {
    const { queue, subscribers, stops, pendingTimers, finishSynthesis } = setup();
    queue.push(item("un"));
    queue.push(item("deux"));
    await finishSynthesis(0, 5000);
    expect(pendingTimers()).toBe(1);
    queue.stop();
    expect(subscribers()).toBe(0);
    expect(pendingTimers()).toBe(0);
    expect(stops.count).toBe(1);
    expect(queue.count(() => true)).toBe(0);
  });

  it("dit pourquoi une entrée n'a pas été lue, et passe à la suivante", async () => {
    const { queue, spoken, logs, flush } = setup();
    queue.push(item("un"));
    queue.push(item("deux"));
    spoken[0]?.settle({ ok: false, status: 502, message: "la synthèse a échoué" });
    await flush();
    expect(logs).toEqual(["Renard : message de un non lu : la synthèse a échoué"]);
    expect(spoken.map(({ text }) => text)).toEqual(["un", "deux"]);
  });

  it("applique les durées réglées : silence avant de dire", async () => {
    const { queue, voice, spoken, tick } = setup();
    queue.update({ ...settings, foxReadSilence: 3000 });
    Object.assign(voice, { isTalking: false, talkingFor: 0, silentFor: 2999 });
    queue.push(item("un"));
    await tick();
    expect(spoken).toEqual([]);
    voice.silentFor = 3000;
    await tick();
    expect(spoken).toHaveLength(1);
  });
});

describe("createFoxQueue : un message qui attend trop longtemps n'est plus lu", () => {
  const MAX_WAIT = { foxReadMaxWait: 120_000 };
  const silent = { isTalking: false, talkingFor: 0, silentFor: Number.POSITIVE_INFINITY };

  it("garde un message à 2 min pile, puis le retire à 2 min 1 s avec une ligne dans le journal", async () => {
    const { queue, voice, spoken, logs, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.push(item("un", { label: "message de Alice" }));
    await advance(120_000);
    await tick();
    expect(logs).toEqual([]);
    expect(queue.count(() => true)).toBe(1);
    await advance(1000);
    await tick();
    expect(logs).toEqual(["Renard : message de Alice expiré (attente de plus de 2 min)"]);
    expect(queue.count(() => true)).toBe(0);
    Object.assign(voice, silent);
    await tick();
    expect(spoken).toEqual([]);
  });

  it("ne retire que le vieux message : le récent est dit quand Alexis se tait", async () => {
    const { queue, voice, spoken, logs, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.push(item("vieux"));
    await advance(100_000);
    queue.push(item("récent"));
    await advance(30_000);
    await tick();
    expect(logs).toEqual(["Renard : message de vieux expiré (attente de plus de 2 min)"]);
    Object.assign(voice, silent);
    await tick();
    expect(spoken.map(({ text }) => text)).toEqual(["récent"]);
  });

  it("n'écrit qu'une ligne par message, même après d'autres pas", async () => {
    const { queue, voice, logs, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.push(item("un"));
    await advance(121_000);
    await tick();
    await tick();
    await advance(1000);
    await tick();
    expect(logs).toHaveLength(1);
  });

  it("ne garde plus le renard éveillé une fois le message expiré", async () => {
    const { queue, voice, calls, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.push(item("un"));
    await advance(121_000);
    await tick();
    const wakes = calls.wakes;
    await tick();
    expect(calls.wakes).toBe(wakes);
  });

  it("n'expire jamais un remerciement, ni le message qui lui est joint, ni une pique : ils sont dits au silence d'Alexis", async () => {
    const { queue, voice, spoken, logs, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.push(thanks("merci"));
    queue.push(item("joint", { isUrgent: true }));
    queue.push(item("pique", { kind: "jab", label: "pique" }));
    await advance(300_000);
    await tick();
    expect(logs).toEqual([]);
    expect(queue.count(() => true)).toBe(3);
    Object.assign(voice, silent);
    await tick();
    expect(spoken.map(({ text }) => text)).toEqual(["merci"]);
  });

  it("n'expire pas le message qu'on lit", async () => {
    const { queue, spoken, logs, tick, advance } = setup(MAX_WAIT);
    queue.push(item("un"));
    expect(spoken).toHaveLength(1);
    await advance(300_000);
    await tick();
    expect(logs).toEqual([]);
    expect(queue.count(() => true)).toBe(1);
  });

  it("n'expire rien sans réglage foxReadMaxWait", async () => {
    const { queue, voice, logs, tick, advance } = setup();
    talking(voice, 5000);
    queue.push(item("un"));
    await advance(3_600_000);
    await tick();
    expect(logs).toEqual([]);
    expect(queue.count(() => true)).toBe(1);
  });

  it("applique le délai réglé, sans redémarrer", async () => {
    const { queue, voice, logs, tick, advance } = setup(MAX_WAIT);
    talking(voice, 5000);
    queue.update({ ...settings, foxReadMaxWait: 30_000 });
    queue.push(item("un"));
    await advance(31_000);
    await tick();
    expect(logs).toEqual(["Renard : message de un expiré (attente de plus de 30 s)"]);
  });
});
