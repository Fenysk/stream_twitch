import { describe, expect, it } from "vitest";
import { toInsultList } from "../domain/chat-insults.rules";
import { FLINCH_MODE, type Show } from "../domain/fox-mode.rules";
import type { RewardEvent } from "../domain/reward.types";
import type { Settings } from "../domain/settings.schema";
import type { SpeakResult } from "./fox.usecase";
import { createFoxQueue, type QueueItem } from "./fox-queue.usecase";
import { createFoxReward } from "./fox-reward.usecase";
import type { AfterSound } from "./sound-queue.usecase";

const spend = (overrides: Partial<RewardEvent> = {}): RewardEvent => ({
  kind: "reward",
  id: "red-1",
  rewardId: "reward-drink",
  title: "À boire !",
  user: "Alice",
  ...overrides,
});

const insults = toInsultList("connard\nsalope");

// Le usecase seul : une file qui garde ce qu'on y pousse, une queue des sons qui ne connaît que certaines récompenses.
const setup = (
  options: {
    phrases?: Record<string, string[]>;
    soundRewards?: string[];
    flinchTitles?: string[];
    // Le délai (ms) du flinch après le départ du sound ; sans lui, 0.
    flinchDelay?: number;
    // Ce que `flash` rend : 0, le renard n'est pas visible et rien n'est montré.
    flashMs?: number;
    random?: () => number;
  } = {},
) => {
  const phrases: Record<string, string[]> = options.phrases ?? {
    "reward-drink": ["Bois un coup de la part de {user} !"],
  };
  const soundRewards = new Set(options.soundRewards ?? []);
  const flinchTitles = new Set(options.flinchTitles ?? []);
  const state = {
    activity: 0,
    said: [] as string[],
    speak: { ok: true, url: "/s/1", durationMs: 1000 } as SpeakResult,
    flinchDelay: options.flinchDelay ?? 0,
  };
  const timers: { ms: number; callback: () => void }[] = [];
  const pushed: QueueItem[] = [];
  const soundCalls: {
    rewardId: string;
    afterSound: AfterSound | undefined;
    onPlay: (() => void) | undefined;
  }[] = [];
  const logs: string[] = [];
  const flashes: Show[] = [];
  // Ce qui part, dans l'ordre : le flinch du renard et la phrase poussée dans sa file.
  const events: string[] = [];
  const reward = createFoxReward({
    queue: {
      push(item) {
        pushed.push(item);
        events.push("phrase");
      },
    },
    mode: {
      async say(text) {
        state.said.push(text);
        return state.speak;
      },
      flash(show) {
        flashes.push(show);
        events.push("flash");
        return options.flashMs ?? 1000;
      },
    },
    sounds: {
      redeem(event, afterSound, onPlay) {
        if (!soundRewards.has(event.rewardId)) return false;
        soundCalls.push({ rewardId: event.rewardId, afterSound, onPlay });
        return true;
      },
    },
    phrases: { get: (rewardId) => phrases[rewardId] ?? [] },
    jab: {
      noteActivity() {
        state.activity += 1;
      },
    },
    insults,
    isReserved: (title) => title === "Clasher Fenysk",
    isFlinch: (title) => flinchTitles.has(title),
    getFlinchDelay: () => state.flinchDelay,
    schedule: (callback, ms) => {
      timers.push({ ms, callback });
      return () => undefined;
    },
    random: options.random ?? (() => 0),
    log: (line) => logs.push(line),
  });
  return { reward, state, pushed, soundCalls, logs, flashes, events, timers };
};

describe("createFoxReward : un rachat sans sound dit une phrase de la récompense", () => {
  it("dit la phrase avec le nickname du viewer, comme un remerciement : urgente, jamais coupée, rien montré avant", () => {
    const { reward, pushed, logs, state } = setup();
    reward.redeem(spend());
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      kind: "thanks",
      label: "récompense (À boire !)",
      text: "Bois un coup de la part de Alice !",
      isCuttable: false,
      isUrgent: true,
    });
    expect(pushed[0]?.toShow()).toBeNull();
    expect(state.activity).toBe(1);
    expect(logs).toContain("Renard : récompense « À boire ! » : « Bois un coup de la part de Alice ! »");
  });

  it("ne dit rien d'une récompense sans phrases, ni pour une autre récompense", () => {
    const { reward, pushed, state } = setup();
    reward.redeem(spend({ rewardId: "reward-stretch", title: "Étirement !" }));
    expect(pushed).toEqual([]);
    expect(state.activity).toBe(0);
  });

  it("ne répète jamais la même phrase deux fois de suite, récompense par récompense", () => {
    const { reward, pushed } = setup({
      phrases: { "reward-drink": ["A", "B"], "reward-stretch": ["C", "D"] },
    });
    for (const rewardId of ["reward-drink", "reward-drink", "reward-drink", "reward-stretch"]) {
      reward.redeem(spend({ rewardId }));
    }
    expect(pushed.map(({ text }) => text)).toEqual(["A", "B", "A", "C"]);
  });

  it("dit « quelqu'un » quand le filtre d'insultes refuse le nickname, et le journal le dit", () => {
    const { reward, pushed, logs } = setup();
    reward.redeem(spend({ user: "Connard42" }));
    expect(pushed[0]?.text).toBe("Bois un coup de la part de quelqu'un !");
    expect(logs).toContain(
      "Renard : pseudo refusé par le filtre d'insultes (récompense « À boire ! »), il n'est pas dit.",
    );
  });

  it("écarte la phrase dont une variable n'a pas de valeur, et ne dit rien s'il n'en reste aucune", () => {
    const { reward, pushed, logs } = setup({
      phrases: { "reward-drink": ["Bois {boisson} !", "Santé {user} !"], "reward-stretch": ["{boisson}"] },
    });
    reward.redeem(spend());
    reward.redeem(spend({ rewardId: "reward-stretch", title: "Étirement !" }));
    expect(pushed.map(({ text }) => text)).toEqual(["Santé Alice !"]);
    expect(logs).toContain(
      "Renard : aucune phrase possible pour la récompense « Étirement ! », rien n'est dit.",
    );
  });

  it("laisse la récompense du renard (clash, wake) à son mécanisme : aucune phrase d'ici", () => {
    const { reward, pushed, soundCalls } = setup({
      phrases: { "reward-clash": ["Salut {user}"] },
      soundRewards: ["reward-clash"],
    });
    reward.redeem(spend({ rewardId: "reward-clash", title: "Clasher Fenysk" }));
    expect(pushed).toEqual([]);
    expect(soundCalls).toEqual([{ rewardId: "reward-clash", afterSound: undefined }]);
  });
});

describe("createFoxReward : un rachat avec un sound dit sa phrase quand le sound se termine", () => {
  it("confie la phrase à la queue des sounds, qui la lance à la fin du son : rien n'est dit avant", () => {
    const { reward, pushed, soundCalls } = setup({ soundRewards: ["reward-drink"] });
    reward.redeem(spend());
    expect(soundCalls).toHaveLength(1);
    expect(pushed).toEqual([]);
    void soundCalls[0]?.afterSound?.();
    expect(pushed.map(({ text }) => text)).toEqual(["Bois un coup de la part de Alice !"]);
  });

  it("rend vrai quand la phrase est dite jusqu'au bout, faux quand la synthèse échoue", async () => {
    const { reward, pushed, soundCalls } = setup({ soundRewards: ["reward-drink"] });
    reward.redeem(spend());
    const first = soundCalls[0]?.afterSound?.();
    pushed[0]?.onDone?.(true);
    expect(await first).toBe(true);
    const second = soundCalls[0]?.afterSound?.();
    pushed[1]?.onDone?.(false);
    expect(await second).toBe(false);
  });

  it("rend faux, sans rien dire, quand aucune phrase ne peut l'être", async () => {
    const { reward, pushed, soundCalls } = setup({
      phrases: { "reward-drink": ["Bois {boisson} !"] },
      soundRewards: ["reward-drink"],
    });
    reward.redeem(spend());
    expect(await soundCalls[0]?.afterSound?.()).toBe(false);
    expect(pushed).toEqual([]);
  });

  it("ne donne pas de phrase à la queue des sounds pour une récompense qui n'en a pas : le sound seul comme avant", () => {
    const { reward, soundCalls } = setup({ phrases: {}, soundRewards: ["reward-drink"] });
    reward.redeem(spend());
    expect(soundCalls).toEqual([{ rewardId: "reward-drink", afterSound: undefined }]);
  });
});

describe("createFoxReward : une récompense de foxFlinchRewards choque le renard", () => {
  const prout = { rewardId: "reward-prout", title: "Prout." };
  const withPhrase = { flinchTitles: ["Prout."], phrases: { "reward-prout": ["Pouah, {user} !"] } };

  it("avec un sound : le flinch part quand la queue envoie le sound à la page, pas avant", () => {
    const { reward, flashes, soundCalls, logs } = setup({ ...withPhrase, soundRewards: ["reward-prout"] });
    reward.redeem(spend(prout));
    expect(soundCalls).toHaveLength(1);
    expect(flashes).toEqual([]);
    soundCalls[0]?.onPlay?.();
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(logs).toContain("Renard : récompense « Prout. », il se tourne vers Fenysk, choqué.");
  });

  it("sans sound : le flinch part tout de suite, avant la phrase de la récompense", () => {
    const { reward, flashes, events, pushed, logs } = setup(withPhrase);
    reward.redeem(spend(prout));
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(events).toEqual(["flash", "phrase"]);
    expect(pushed.map(({ text }) => text)).toEqual(["Pouah, Alice !"]);
    expect(logs).toContain("Renard : récompense « Prout. », il se tourne vers Fenysk, choqué.");
  });

  it("sans sound ni phrases : le flinch part seul", () => {
    const { reward, flashes, pushed } = setup({ flinchTitles: ["Prout."], phrases: {} });
    reward.redeem(spend(prout));
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(pushed).toEqual([]);
  });

  it("garde son sound et ses phrases : la phrase est toujours dite après le sound, le flinch n'y change rien", () => {
    const { reward, soundCalls, pushed, events } = setup({ ...withPhrase, soundRewards: ["reward-prout"] });
    reward.redeem(spend(prout));
    soundCalls[0]?.onPlay?.();
    expect(pushed).toEqual([]);
    void soundCalls[0]?.afterSound?.();
    expect(pushed.map(({ text }) => text)).toEqual(["Pouah, Alice !"]);
    expect(events).toEqual(["flash", "phrase"]);
  });

  it("ne choque pas pour un titre qui n'est pas dans la liste, avec ou sans sound", () => {
    const { reward, flashes, soundCalls, logs } = setup({ ...withPhrase, soundRewards: ["reward-drink"] });
    reward.redeem(spend());
    reward.redeem(spend({ rewardId: "reward-stretch", title: "Étirement !" }));
    expect(soundCalls).toHaveLength(1);
    expect(soundCalls[0]?.onPlay).toBeUndefined();
    expect(flashes).toEqual([]);
    expect(logs.filter((line) => line.includes("choqué"))).toEqual([]);
  });

  it("n'écrit rien dans le journal quand le renard n'est pas visible : rien n'est montré", () => {
    const { reward, flashes, logs } = setup({ ...withPhrase, flashMs: 0 });
    reward.redeem(spend(prout));
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(logs.filter((line) => line.includes("choqué"))).toEqual([]);
  });
});

describe("createFoxReward : le flinch attend foxFlinchDelay après le départ du sound", () => {
  const prout = { rewardId: "reward-prout", title: "Prout." };
  const withSound = { flinchTitles: ["Prout."], soundRewards: ["reward-prout"] };

  it("avec un délai de 1000 ms : rien au départ du sound, le flinch part 1000 ms plus tard", () => {
    const { reward, flashes, soundCalls, timers, logs } = setup({ ...withSound, flinchDelay: 1000 });
    reward.redeem(spend(prout));
    soundCalls[0]?.onPlay?.();
    expect(flashes).toEqual([]);
    expect(timers.map(({ ms }) => ms)).toEqual([1000]);
    timers[0]?.callback();
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(logs).toContain("Renard : récompense « Prout. », il se tourne vers Fenysk, choqué.");
  });

  it("avec un délai de 0 : le flinch part au départ du sound, sans minuterie", () => {
    const { reward, flashes, soundCalls, timers } = setup({ ...withSound, flinchDelay: 0 });
    reward.redeem(spend(prout));
    soundCalls[0]?.onPlay?.();
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(timers).toEqual([]);
  });

  it("lit le délai au départ du sound : un réglage changé pendant l'attente de la queue s'applique", () => {
    const { reward, state, flashes, soundCalls, timers } = setup({ ...withSound, flinchDelay: 1000 });
    reward.redeem(spend(prout));
    state.flinchDelay = 250;
    soundCalls[0]?.onPlay?.();
    expect(flashes).toEqual([]);
    expect(timers.map(({ ms }) => ms)).toEqual([250]);
  });

  it("sans sound : le flinch part tout de suite malgré le délai, sans minuterie", () => {
    const { reward, flashes, timers } = setup({ flinchTitles: ["Prout."], flinchDelay: 1000 });
    reward.redeem(spend(prout));
    expect(flashes).toEqual([FLINCH_MODE]);
    expect(timers).toEqual([]);
  });

  it("ne programme rien pour un titre qui n'est pas dans la liste", () => {
    const { reward, soundCalls, timers } = setup({ ...withSound, flinchDelay: 1000 });
    reward.redeem(spend({ rewardId: "reward-prout", title: "Autre titre" }));
    expect(soundCalls[0]?.onPlay).toBeUndefined();
    expect(timers).toEqual([]);
  });
});

describe("createFoxReward : « Tester »", () => {
  it("dit une phrase de la récompense tout de suite, avec Fenysk pour {user}", async () => {
    const { reward, state, pushed } = setup();
    expect(await reward.test("reward-drink")).toEqual({ ok: true, url: "/s/1", durationMs: 1000 });
    expect(state.said).toEqual(["Bois un coup de la part de Fenysk !"]);
    expect(pushed).toEqual([]);
  });

  it("tire au hasard parmi les phrases qui peuvent être dites", async () => {
    const { reward, state } = setup({
      phrases: { "reward-drink": ["A {boisson}", "B {user}", "C {user}"] },
      random: () => 0.99,
    });
    await reward.test("reward-drink");
    expect(state.said).toEqual(["C Fenysk"]);
  });

  it("refuse une récompense sans phrase à dire (400), et rend le refus de la synthèse tel quel", async () => {
    const { reward, state } = setup({ phrases: { "reward-stretch": ["{boisson}"] } });
    const message = "cette récompense n'a pas de phrase à dire";
    expect(await reward.test("reward-drink")).toEqual({ ok: false, status: 400, message });
    expect(await reward.test("reward-stretch")).toEqual({ ok: false, status: 400, message });
    expect(state.said).toEqual([]);
    const { reward: refused, state: refusedState } = setup();
    refusedState.speak = { ok: false, status: 502, message: "la synthèse a échoué" };
    expect(await refused.test("reward-drink")).toEqual({
      ok: false,
      status: 502,
      message: "la synthèse a échoué",
    });
  });
});

// Les réglages de la vraie file du renard, « Lire le tchat » désactivé.
const queueSettings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShouldReadChat: false,
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

// Le usecase devant la vraie file : Alexis parle d'abord, puis se tait ; la synthèse et le temps se règlent à la main.
const setupQueue = (options: { hasSound?: boolean } = {}) => {
  const voice = { isTalking: true, talkingFor: 100, silentFor: 0 };
  const calls = { wakes: 0 };
  const spoken: { text: string; settle: (result: SpeakResult) => void }[] = [];
  const timers: { callback: () => void; isCancelled: boolean }[] = [];
  let tick: () => void = () => undefined;
  const queue = createFoxQueue({
    fox: {
      speak: (text) => new Promise<SpeakResult>((resolve) => spoken.push({ text, settle: resolve })),
      stop: () => undefined,
    },
    mode: {
      getVoice: () => ({ ...voice }),
      wake() {
        calls.wakes += 1;
        return 0;
      },
      noteSpoke: () => undefined,
      introduce: () => ({ ready: Promise.resolve(), cancel: () => undefined }),
      subscribe(listener) {
        tick = listener;
        return () => undefined;
      },
    },
    settings: queueSettings,
    clock: () => 0,
    schedule(callback) {
      const timer = { callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: () => undefined,
  });
  queue.start();
  const afterSounds: AfterSound[] = [];
  const reward = createFoxReward({
    queue,
    mode: { say: async () => ({ ok: true, url: "/s/1", durationMs: 1000 }), flash: () => 0 },
    sounds: {
      redeem(_event, afterSound) {
        if (options.hasSound && afterSound) afterSounds.push(afterSound);
        return options.hasSound === true;
      },
    },
    phrases: { get: () => ["Bois un coup de la part de {user} !"] },
    jab: { noteActivity: () => undefined },
    insults,
    isReserved: () => false,
    isFlinch: () => false,
    getFlinchDelay: () => 0,
    schedule: () => () => undefined,
    random: () => 0,
    log: () => undefined,
  });
  const flush = async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  };
  // Alexis se tait : la file reprend au pas suivant.
  const silence = async () => {
    Object.assign(voice, { isTalking: false, talkingFor: 0, silentFor: Number.POSITIVE_INFINITY });
    tick();
    await flush();
  };
  // La n-ième phrase finit de se synthétiser, puis de se dire (son temps passe).
  const finishSpeech = async (index: number) => {
    spoken[index]?.settle({ ok: true, url: `/s/${index}`, durationMs: 1000 });
    await flush();
    for (const timer of timers.filter(({ isCancelled }) => !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
    await flush();
  };
  const chatMessage = (text: string): QueueItem => ({
    kind: "message",
    label: `message (${text})`,
    text,
    isCuttable: true,
    isUrgent: false,
    toShow: () => null,
  });
  return { queue, reward, spoken, calls, afterSounds, silence, finishSpeech, chatMessage };
};

describe("createFoxReward : devant la vraie file du renard", () => {
  it("passe devant les messages du chat qui attendent, même si « Lire le tchat » est désactivé", async () => {
    const { queue, reward, spoken, calls, chatMessage, silence } = setupQueue();
    queue.push(chatMessage("Salut le chat"));
    queue.push(chatMessage("Un deuxième message"));
    const wakes = calls.wakes;
    reward.redeem(spend({ rewardId: "reward-drink" }));
    expect(calls.wakes).toBeGreaterThan(wakes);
    expect(spoken).toEqual([]);
    await silence();
    expect(spoken.map(({ text }) => text)).toEqual(["Bois un coup de la part de Alice !"]);
  });

  it("rend vrai à la queue des sons une fois la phrase dite jusqu'au bout, faux quand la synthèse échoue", async () => {
    const { reward, spoken, afterSounds, silence, finishSpeech } = setupQueue({ hasSound: true });
    reward.redeem(spend());
    reward.redeem(spend({ user: "Bob" }));
    const [first, second] = afterSounds;
    if (!first || !second) throw new Error("la queue des sons n'a pas reçu les deux phrases");
    const wasSaid: boolean[] = [];
    const settle = async (afterSound: AfterSound) => wasSaid.push(await afterSound());
    const firstSaid = settle(first);
    await silence();
    await finishSpeech(0);
    await firstSaid;
    expect(wasSaid).toEqual([true]);
    const secondSaid = settle(second);
    await silence();
    spoken[1]?.settle({ ok: false, status: 502, message: "la synthèse a échoué" });
    await secondSaid;
    expect(wasSaid).toEqual([true, false]);
  });
});
