import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import { FOX_START, toFoxDisplay, toFoxRules, toNextFox } from "../domain/fox.rules";
import type { FoxEvent, FoxMode } from "../domain/fox.schema";
import { ADDRESS_MODE, FLINCH_MODE, IDLE_MODE, isFacingFenysk } from "../domain/fox-mode.rules";
import { NO_JOY, toJoyBody } from "../domain/joy.rules";
import type { LiveEvent } from "../domain/live.types";
import { MIRROR_START, toMirrorScale, toNextMirror } from "../domain/mirror.rules";
import {
  DIVE_ANGLE,
  HIDDEN_OFFSET,
  type PresencePose,
  toNextPose,
  toPresenceBody,
} from "../domain/presence.rules";
import type { Settings } from "../domain/settings.schema";
import type { Slot } from "../domain/timetable.rules";
import type { Voice } from "../domain/voice.schema";
import type { ChatSourceEvent } from "./chat.usecase";
import { createFox, type VoicePort } from "./fox.usecase";
import { createFoxAttitude } from "./fox-attitude.usecase";
import { createFoxBalance } from "./fox-balance.usecase";
import { createFoxChat } from "./fox-chat.usecase";
import { createFoxComeback } from "./fox-comeback.usecase";
import { type Broadcast, createFoxHours } from "./fox-hours.usecase";
import { createFoxJab } from "./fox-jab.usecase";
import { createFoxMode } from "./fox-mode.usecase";
import { createFoxQueue } from "./fox-queue.usecase";
import { createFoxReview } from "./fox-review.usecase";
import { createFoxShout } from "./fox-shout.usecase";
import { createFoxStartle } from "./fox-startle.usecase";
import { createFoxTally } from "./fox-tally.usecase";
import { createFoxThanks } from "./fox-thanks.usecase";
import { createFoxTunnel } from "./fox-tunnel.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  chatChannel: "fenysk",
  chatBots: ["nightbot"],
  foxVoice: "Microsoft Claude",
  foxSmallThreshold: -36,
  foxMediumThreshold: -22,
  foxLargeChance: 0.3,
  foxBounce: 0.03,
  foxBreathPeriod: 4000,
  foxBreath: 0.015,
  foxGazeMin: 5000,
  foxGazeMax: 15000,
  foxBlinkMin: 3000,
  foxBlinkMax: 6000,
  foxBlinkDuration: 150,
  foxListenMin: 2000,
  foxListenMax: 4000,
  foxReadSilence: 1000,
  foxStopAfter: 1000,
  foxReactionDuration: 1000,
  foxJoyDuration: 800,
  foxAwayAfter: 180_000,
  foxCrouchDuration: 300,
  foxJumpDuration: 400,
  foxDiveDuration: 800,
  foxReturnDuration: 800,
  foxYawnDuration: 2000,
  foxRaidDuration: 3000,
  foxJabAfter: 180_000,
  foxJabGap: 600_000,
  foxShoutThreshold: -5,
  foxShoutMerge: 1000,
  foxShoutCount: 3,
  foxShoutPeriod: 120_000,
  foxShoutLong: 3000,
  foxShoutGap: 600_000,
  foxTunnelAfter: 180_000,
  foxTunnelPause: 5000,
  foxTunnelGap: 600_000,
  foxShouldHailComeback: true,
  foxComebackAfter: 300_000,
  foxBalanceMargin: 0,
  foxBalanceAfter: 10_000,
  foxBalanceGap: 300_000,
  foxStartleRise: 20,
  foxStartleWithin: 300,
  foxStartleLevel: -15,
  foxStartleGap: 30_000,
  foxEndAt: "",
  foxEndWarningMarks: ["30"],
  foxOvertimeGap: 600_000,
  foxLateAfter: "23:30",
  foxLateYawnMin: 300_000,
  foxLateYawnMax: 600_000,
  foxShouldReadChat: true,
  foxShouldReadOwn: true,
  foxReadMaxLength: 150,
  foxReadGap: 10_000,
  foxReadQueueSize: 3,
  foxCapitalsMaxLength: 15,
  foxEmoteNames: ["KEKW"],
};

const insults = toInsultList("connard\nsalope\n=con\n=pd");

const message = (id: string, text: string, overrides: Partial<RawMessage> = {}): RawMessage => ({
  id,
  viewerId: `viewer-${id}`,
  viewerLogin: `viewer${id}`,
  nickname: `Viewer${id}`,
  color: null,
  text,
  emotes: [],
  isCommand: false,
  ...overrides,
});

// Un WAV de `seconds` secondes (16 kHz, 16 bits, mono) : de quoi donner sa durée à la phrase.
const toWav = (seconds: number): Uint8Array => {
  const size = 32_000 * seconds;
  const bytes = new Uint8Array(44 + size);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + size, true);
  bytes.set([87, 65, 86, 69], 8);
  bytes.set([102, 109, 116, 32], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  bytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, size, true);
  return bytes;
};

// Hasard déterministe (mulberry32).
const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const label = (event: FoxEvent): string => {
  switch (event.kind) {
    case "mode":
      return event.mode.kind === "reaction" ? `mode:reaction:${event.mode.image}` : `mode:${event.mode.kind}`;
    case "presence":
      return `presence:${event.presence}`;
    default:
      return event.kind;
  }
};

// Le temps où il est parti : 3 min sans parler, le bâillement (2 s) et la descente (1,5 s) sont finis.
const AWAY_AT = 184_000;

type Timer = { at: number; order: number; callback: () => void; isCancelled: boolean };
type Timed = { at: number; event: FoxEvent };

// Le serveur du renard vrai (voix et tchat exceptés) dans un temps simulé : les timers se déclenchent à leur date exacte,
// et le micro d'Alexis est un faux qui n'émet que quand le test le fait parler.
const build = (
  options: {
    seconds?: number;
    jabs?: string[];
    reminders?: string[];
    // Le prochain live d'Alexis dans sa timetable.
    slot?: Slot;
    shouts?: string[];
    tunnelToFenysk?: string[];
    tunnelToChat?: string[];
    comebackToFenysk?: string[];
    comebackToChat?: string[];
    balanceAlerts?: string[];
    viewers?: number | null;
    overrides?: Partial<Settings>;
    // L'heure du PC au départ (ms) ; par défaut 1 000 000.
    startAt?: number;
    // Les réglages de l'heure du live : toutes les listes de phrases sont vides tant qu'un test ne les donne pas.
    hours?: Partial<Settings>;
    // Le serveur vient de démarrer : le renard est caché. Sans cela, le test part d'un renard déjà revenu et posé (visible).
    isHidden?: boolean;
    // Fenysk a déjà parlé une fois, 1 s avant le départ du test : sans cela, la relance attend sa première parole.
    isHeard?: boolean;
  } = {},
) => {
  // Les réglages de ce serveur : les piques sont celles du test, aucune par défaut (le renard ne revient pas de lui-même).
  // Un remerciement par liste : la phrase est connue d'avance.
  const serverSettings: Settings = {
    ...settings,
    foxJabs: options.jabs ?? [],
    foxReminders: options.reminders ?? [],
    foxShouts: options.shouts ?? [],
    foxTunnelToFenysk: options.tunnelToFenysk ?? [],
    foxTunnelToChat: options.tunnelToChat ?? [],
    foxComebackToFenysk: options.comebackToFenysk ?? [],
    foxComebackToChat: options.comebackToChat ?? [],
    foxBalanceAlerts: options.balanceAlerts ?? [],
    foxHourPhrases: [],
    foxEndWarningPhrases: [],
    foxEndSoonPhrases: [],
    foxEndPanicPhrases: [],
    foxEndPhrases: [],
    foxOvertimePhrases: [],
    foxBedtimePhrases: [],
    ...options.hours,
    foxPronunciations: ["gg = gé gé", "wtf = what the fuck", "fenysk = Fénisque"],
    foxShouldThank: true,
    foxThankGap: 10_000,
    foxThanksFollow: ["Merci {user} pour le follow."],
    foxThanksFollowGeneric: ["Merci aux nouveaux followers."],
    foxThanksSub: ["Merci {user} pour le sub."],
    foxThanksGiftOne: ["{user} offre un sub à {recipient}."],
    foxThanksGiftMany: ["{user} offre {count} subs."],
    foxThanksCheer: ["Merci {user} pour {bits} bits."],
    foxThanksLurk: ["Merci {user} pour le lurk."],
    foxThanksLurkGeneric: ["Merci pour le lurk."],
    foxTalkativeMessages: 50,
    foxThanksTalkative: ["{user} a écrit {messages} messages."],
    foxThanksRaid: ["{user} débarque avec {viewers}."],
    foxThanksRaidGeneric: ["Un raid de {viewers} !"],
    foxClashRewards: ["Clasher Fenysk"],
    foxClashIntros: ["{user} m'a payé pour te dire ça :"],
    foxWakeRewards: ["Réveiller Jean-Renard"],
    foxThanksWakeAsleep: ["Quoi ?! Je dormais, moi !", "Qui m'a réveillé ? C'est toi, {user} ?"],
    foxThanksWakeAwake: ["Je dors pas, {user}. Je réfléchis."],
    foxThanksPrediction: ["Perdants sur « {issue} » : {perdants}. Courage."],
    foxThanksPredictionNoLoser: ["Tout le monde a gagné. C'est louche."],
    // L'humeur ne bouge pas, sauf pour un test qui la règle : pas de joie à 1 000 messages, pas de bouderie ni de reprise avant 24 h.
    foxCheerfulCount: 1000,
    foxCheerfulPeriod: 300_000,
    foxSulkAfter: 86_400_000,
    foxResumeAfter: 86_400_000,
    foxResumePhrases: ["Ah, maintenant vous parlez ?"],
    ...options.overrides,
  };
  // Un renard visible a d'abord dû revenir : le temps simulé part de ce saut en arrière, et `start` est l'instant où il s'est posé.
  const start = options.startAt ?? 1_000_000;
  const settleMs = options.isHidden ? 0 : (serverSettings.foxReturnDuration ?? 0);
  const sim = { now: start - settleMs, order: 0, ids: 0 };
  let timers: Timer[] = [];
  const events: Timed[] = [];
  const logs: string[] = [];
  const schedule = (callback: () => void, ms: number) => {
    sim.order += 1;
    const timer: Timer = { at: sim.now + ms, order: sim.order, callback, isCancelled: false };
    timers.push(timer);
    return () => {
      timer.isCancelled = true;
    };
  };
  const flush = async () => {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  };
  const run = async (ms: number) => {
    const target = sim.now + ms;
    for (;;) {
      timers = timers.filter(({ isCancelled }) => !isCancelled);
      const due = timers.filter(({ at }) => at <= target).sort((a, b) => a.at - b.at || a.order - b.order)[0];
      if (!due) break;
      sim.now = Math.max(sim.now, due.at);
      due.isCancelled = true;
      due.callback();
      await flush();
    }
    sim.now = target;
    await flush();
  };
  const synthesized: string[] = [];
  const voices: VoicePort = {
    async list(): Promise<Voice[]> {
      return [];
    },
    async synthesize({ text }) {
      synthesized.push(text);
      return toWav(options.seconds ?? 1);
    },
  };
  const fox = createFox({
    voices,
    settings: serverSettings,
    clock: () => sim.now,
    createId: () => {
      sim.ids += 1;
      return `s${sim.ids}`;
    },
    toSpeechUrl: (id) => `/api/fox/speech/${id}`,
    log: (line) => logs.push(line),
  });
  fox.subscribe("screen", (event) => events.push({ at: sim.now, event }));
  const micListeners = new Set<(level: number) => void>();
  const mic = {
    subscribe(listener: (level: number) => void) {
      micListeners.add(listener);
      return () => {
        micListeners.delete(listener);
      };
    },
  };
  const desktopListeners = new Set<(level: number) => void>();
  const desktop = {
    subscribe(listener: (level: number) => void) {
      desktopListeners.add(listener);
      return () => {
        desktopListeners.delete(listener);
      };
    },
  };
  const mode = createFoxMode({
    mic,
    fox,
    settings: serverSettings,
    clock: () => sim.now,
    schedule,
    log: (line) => logs.push(line),
  });
  if (!options.isHidden) {
    // Il revient puis se pose à `start`, ses 3 min repartent de là ; ni évènement ni ligne de journal n'en reste.
    mode.wake();
    sim.now += settleMs;
    mode.noteSpoke();
    mode.update(serverSettings);
    events.length = 0;
    logs.length = 0;
  }
  const listeners = new Set<(event: ChatSourceEvent) => void>();
  const chat = {
    subscribeSource(listener: (event: ChatSourceEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const emit = (event: ChatSourceEvent) => {
    for (const listener of listeners) listener(event);
  };
  const queue = createFoxQueue({
    fox,
    mode,
    settings: serverSettings,
    clock: () => sim.now,
    schedule,
    log: (line) => logs.push(line),
  });
  const tally = createFoxTally();
  const attitude = createFoxAttitude({
    mode,
    fox,
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(23),
    log: (line) => logs.push(line),
  });
  const foxChat = createFoxChat({
    chat,
    queue,
    mode,
    emotes: { getNames: () => [] },
    regulars: { noteMessage: () => null },
    tally,
    attitude,
    settings: serverSettings,
    insults,
    clock: () => sim.now,
    log: (line) => logs.push(line),
  });
  const jab = createFoxJab({
    chat,
    queue,
    mode,
    fox,
    timetable: { getNext: () => options.slot ?? null },
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(11),
    log: (line) => logs.push(line),
  });
  const shout = createFoxShout({
    mic,
    queue,
    mode,
    fox,
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(3),
    log: (line) => logs.push(line),
  });
  const tunnel = createFoxTunnel({
    queue,
    mode,
    settings: serverSettings,
    clock: () => sim.now,
    schedule,
    random: seeded(9),
    log: (line) => logs.push(line),
  });
  const comeback = createFoxComeback({
    queue,
    mode,
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(19),
    log: (line) => logs.push(line),
  });
  const broadcastListeners = new Set<(broadcast: Broadcast) => void>();
  const broadcast = {
    subscribe(listener: (broadcast: Broadcast) => void) {
      broadcastListeners.add(listener);
      return () => {
        broadcastListeners.delete(listener);
      };
    },
  };
  const review = createFoxReview({
    tally,
    queue,
    settings: serverSettings,
    insults,
    log: (line) => logs.push(line),
  });
  const hours = createFoxHours({
    broadcast,
    queue,
    mode,
    review,
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(17),
    log: (line) => logs.push(line),
  });
  const startle = createFoxStartle({
    desktop,
    queue,
    mode,
    fox,
    settings: serverSettings,
    clock: () => sim.now,
    log: (line) => logs.push(line),
  });
  const balance = createFoxBalance({
    mic,
    desktop,
    queue,
    mode,
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(13),
    log: (line) => logs.push(line),
  });
  const thanks = createFoxThanks({
    chat,
    queue,
    foxChat,
    viewers: { getCount: () => options.viewers ?? null },
    tally,
    fox,
    jab,
    settings: serverSettings,
    insults,
    clock: () => sim.now,
    schedule,
    random: seeded(5),
    log: (line) => logs.push(line),
  });
  mode.start();
  if (options.isHeard) {
    sim.now -= 1000;
    for (const listener of micListeners) listener(-15);
    sim.now += 1000;
  }
  queue.start();
  foxChat.start();
  attitude.start();
  jab.start();
  shout.start();
  tunnel.start();
  comeback.start();
  balance.start();
  startle.start();
  hours.start();
  thanks.start();
  // OBS dit où en est la diffusion.
  const updateBroadcast = (value: Broadcast) => {
    for (const listener of broadcastListeners) listener(value);
  };
  // Un évènement du tchat (sub, resub, sub offert, cheer), comme ComfyJS le donne.
  const live = async (event: LiveEvent) => {
    emit({ kind: "live", event });
    await flush();
  };
  const receive = async (raw: RawMessage) => {
    emit({ kind: "message", message: raw });
    await flush();
  };
  // Alexis parle `ms` : un level fort toutes les 50 ms, comme le flux du micro d'OBS.
  // `voice` et `game` : le level du mic et celui du son du PC (null : rien), toutes les 50 ms comme le flux d'OBS.
  const sound = async (ms: number, { voice, game }: { voice: number | null; game: number | null }) => {
    for (let spent = 0; spent < ms; spent += 50) {
      if (voice !== null) for (const listener of micListeners) listener(voice);
      if (game !== null) for (const listener of desktopListeners) listener(game);
      await run(50);
    }
  };
  const talk = (ms: number) => sound(ms, { voice: -15, game: null });
  // Alexis crie `ms` : un level au-dessus du seuil de cri (-5 dB), comme le flux du micro d'OBS.
  const cry = (ms: number) => sound(ms, { voice: -3, game: null });
  // Les évènements depuis l'indice `since`, avec leur date relative au démarrage ; les règles et le nombre de pages sont laissés.
  const timeline = (since = 0) =>
    events
      .slice(since)
      .filter(({ event }) => event.kind !== "rules" && event.kind !== "screens")
      .map(({ at, event }) => ({ at: at - start, label: label(event) }));
  const speeches = () => events.filter(({ event }) => event.kind === "speech");
  // Un premier message du viewer : le coucou, la lecture, puis le délai de 10 s entre deux messages d'un même viewer.
  const wave = async (viewerId: string) => {
    await receive(message(`greet-${viewerId}`, "Salut", { viewerId }));
    await run(10_000);
    await run(10_000);
  };
  // Ce que la page afficherait, image par image (16 ms), d'après les évènements du serveur reçus ; sans voix dans l'audio.
  const toImages = (from: number, to: number): string[] => {
    const rules = toFoxRules(settings);
    if (!rules) throw new Error("réglages du renard absents");
    const random = seeded(7);
    let state = FOX_START;
    let current: FoxMode = IDLE_MODE;
    let index = 0;
    const images: string[] = [];
    for (let now = start; now < to; now += 16) {
      while (index < events.length && (events[index]?.at ?? Number.POSITIVE_INFINITY) <= now) {
        const event = events[index]?.event;
        if (event?.kind === "mode") current = event.mode;
        index += 1;
      }
      state = toNextFox({ previous: state, now, level: null, rules, random, mode: current });
      if (now >= from) images.push(toFoxDisplay(state, now, rules).image);
    }
    return images;
  };
  return {
    sim,
    start,
    events,
    logs,
    synthesized,
    fox,
    mode,
    foxChat,
    jab,
    thanks,
    shout,
    tunnel,
    comeback,
    balance,
    startle,
    hours,
    updateBroadcast,
    run,
    talk,
    cry,
    sound,
    receive,
    live,
    wave,
    timeline,
    speeches,
    toImages,
    pendingTimers: () => timers.filter(({ isCancelled }) => !isCancelled).length,
  };
};

describe("D : il attend qu'Alexis se taise", () => {
  it("lit un message arrivé pendant qu'Alexis parle, 1 s après son silence", async () => {
    const harness = build();
    await harness.wave("alice");
    const before = harness.speeches().length;
    await harness.talk(500);
    await harness.receive(message("2", "Salut à tous", { viewerId: "alice" }));
    await harness.talk(2000);
    expect(harness.speeches()).toHaveLength(before);
    const lastLoud = harness.sim.now - 50;
    await harness.run(3000);
    const read = harness.speeches()[before];
    expect(read).toBeDefined();
    expect((read?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((read?.at ?? 0) - lastLoud).toBeLessThanOrEqual(1100);
  });

  it("lit tout de suite un message quand Alexis se tait depuis longtemps", async () => {
    const harness = build();
    await harness.wave("alice");
    await harness.talk(1000);
    await harness.run(5000);
    const before = harness.speeches().length;
    await harness.receive(message("2", "Bonjour", { viewerId: "alice" }));
    expect(harness.speeches()).toHaveLength(before + 1);
  });

  it("coupe la lecture quand Alexis parle plus d'1 s, et n'y revient jamais", async () => {
    const harness = build({ seconds: 6 });
    await harness.wave("alice");
    const before = harness.speeches().length;
    await harness.receive(message("2", "Un message assez long", { viewerId: "alice" }));
    expect(harness.speeches()).toHaveLength(before + 1);
    await harness.run(500);
    const spokeAt = harness.sim.now;
    await harness.talk(2000);
    const stops = harness.events.filter(({ event }) => event.kind === "stop");
    expect(stops).toHaveLength(1);
    expect((stops[0]?.at ?? 0) - spokeAt).toBeGreaterThan(1000);
    expect((stops[0]?.at ?? 0) - spokeAt).toBeLessThanOrEqual(1200);
    await harness.run(120_000);
    expect(harness.speeches()).toHaveLength(before + 1);
    expect(harness.logs.some((line) => line.includes("lecture abandonnée, Alexis parle"))).toBe(true);
  });

  it("ne coupe pas la lecture quand Alexis parle moins d'1 s, puis se tait", async () => {
    const harness = build({ seconds: 6 });
    await harness.wave("alice");
    await harness.receive(message("2", "Un message assez long", { viewerId: "alice" }));
    await harness.talk(900);
    await harness.run(8000);
    expect(harness.events.some(({ event }) => event.kind === "stop")).toBe(false);
  });

  it("n'est jamais tourné vers le tchat pendant qu'il écoute : aucune image left-*, il cligne et alterne", async () => {
    const harness = build();
    await harness.talk(60_000);
    const images = harness.toImages(harness.start + 300, harness.sim.now);
    expect(images.length).toBeGreaterThan(3000);
    expect(images.filter((image) => image.startsWith("left-"))).toEqual([]);
    expect(new Set(images)).toEqual(new Set(["front-closed-rest", "right-closed-rest", "shut-closed-rest"]));
  });

  it("revient au repos quand Alexis se tait", async () => {
    const harness = build();
    await harness.talk(1000);
    await harness.run(2000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["mode:listening", "mode:idle"]);
  });

  it("« Faire parler » n'attend pas son silence et n'est jamais coupé par sa voix", async () => {
    const harness = build({ seconds: 4 });
    await harness.talk(500);
    const before = harness.speeches().length;
    const pending = harness.mode.say("Une phrase d'Alexis");
    await harness.talk(5000);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(harness.speeches()).toHaveLength(before + 1);
    expect((harness.speeches()[before]?.at ?? Number.POSITIVE_INFINITY) - harness.start).toBeLessThan(1000);
    expect(harness.events.some(({ event }) => event.kind === "stop")).toBe(false);
  });

  it("expose ce que le renard sait de la voix d'Alexis", async () => {
    const harness = build();
    expect(harness.mode.getVoice()).toEqual({
      isTalking: false,
      talkingFor: 0,
      silentFor: Number.POSITIVE_INFINITY,
    });
    await harness.talk(1000);
    const talking = harness.mode.getVoice();
    expect(talking.isTalking).toBe(true);
    expect(talking.talkingFor).toBeGreaterThanOrEqual(900);
    await harness.run(2000);
    const silent = harness.mode.getVoice();
    expect(silent.isTalking).toBe(false);
    expect(silent.talkingFor).toBe(0);
    expect(silent.silentFor).toBeGreaterThanOrEqual(2000);
  });
});

describe("E : il réagit une seconde avant de lire", () => {
  it.each([
    ["gg", "front-smile-rest"],
    ["Jean Renard", "front-smile-rest"],
    ["jeanrenard", "front-smile-rest"],
    ["quoi ?!", "left-large-rest"],
    ["bien joué ;)", "wink-tongue-rest"],
    ["bien joué 😉", "wink-tongue-rest"],
  ])("« %s » montre %s pendant 1 s, puis la lecture commence", async (text, image) => {
    const harness = build();
    await harness.wave("alice");
    const since = harness.events.length;
    const from = harness.sim.now;
    await harness.receive(message("2", text, { viewerId: "alice" }));
    await harness.run(3000);
    expect(
      harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - (from - harness.start) })),
    ).toEqual([
      { at: 0, label: `mode:reaction:${image}` },
      { at: 1000, label: "mode:idle" },
      { at: 1000, label: "speech" },
    ]);
  });

  it("lit tout de suite, sans réaction, un message sans mot-clé", async () => {
    const harness = build();
    await harness.wave("alice");
    const since = harness.events.length;
    await harness.receive(message("2", "Bonjour tout le monde", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["speech"]);
  });

  it("montre la bonne image pendant la réaction, puis le regard", async () => {
    const harness = build();
    await harness.wave("alice");
    const from = harness.sim.now;
    await harness.receive(message("2", "gg", { viewerId: "alice" }));
    await harness.run(2000);
    const images = harness.toImages(from + 50, from + 950);
    expect(new Set(images)).toEqual(new Set(["front-smile-rest"]));
  });
});

describe("G : il fait coucou au premier message de chaque viewer", () => {
  it("fait coucou au premier message lu, pas au deuxième", async () => {
    const harness = build();
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline()).toEqual([
      { at: 0, label: "mode:wave" },
      { at: 1000, label: "mode:idle" },
      { at: 1000, label: "speech" },
    ]);
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.receive(message("2", "Re-bonjour", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["speech"]);
  });

  it("alterne les deux images du coucou pendant 1 s", async () => {
    const harness = build();
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(1500);
    const images = harness.toImages(harness.start + 100, harness.start + 950);
    expect(new Set(images)).toEqual(new Set(["front-smile-wave", "front-small-wave"]));
  });

  it("ne fait jamais coucou au compte de la chaîne, avec ou sans mot-clé", async () => {
    const harness = build();
    const own = { viewerId: "owner", viewerLogin: "Fenysk", nickname: "Fenysk" };
    await harness.receive(message("1", "Bienvenue", own));
    await harness.run(3000);
    await harness.run(10_000);
    await harness.receive(message("2", "gg", own));
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual([
      "speech",
      "mode:reaction:front-smile-rest",
      "mode:idle",
      "speech",
    ]);
  });

  it("fait coucou à la place de la réaction quand le premier message porte un mot-clé", async () => {
    const harness = build();
    await harness.receive(message("1", "gg", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["mode:wave", "mode:idle", "speech"]);
  });

  it("ne compte pas un message ignoré comme le premier message lu", async () => {
    const harness = build();
    await harness.receive(message("1", "!discord", { viewerId: "alice", isCommand: true }));
    await harness.run(2000);
    expect(harness.timeline()).toEqual([]);
    await harness.receive(message("2", "Bonjour", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["mode:wave", "mode:idle", "speech"]);
  });
});

const toBodyAt = (harness: ReturnType<typeof build>, at: number) => {
  const curves = toFoxRules(settings);
  if (!curves) throw new Error("réglages du renard absents");
  let pose: PresencePose = { kind: "visible", elapsed: 0, from: { offset: 0, angle: 0 } };
  let poseAt = 0;
  for (const { at: when, event } of harness.events) {
    const time = when - harness.start;
    if (event.kind !== "presence" || time > at) continue;
    pose = toNextPose({ ...pose, elapsed: time - poseAt }, event, curves);
    poseAt = time - event.elapsed;
  }
  return toPresenceBody({ ...pose, elapsed: at - poseAt }, curves);
};

describe("F et H : il bâille, puis s'en va après 3 min sans parler", () => {
  it("part en trois temps après le bâillement : s'accroupit, saute, plonge la tête la première, puis est hors de la source", async () => {
    const harness = build();
    await harness.run(190_000);
    const leavingAt = 182_000;
    expect(toBodyAt(harness, 181_000)).toEqual({ offset: 0, angle: 0, squashX: 1, squashY: 1 });
    const crouched = toBodyAt(harness, leavingAt + 250);
    expect(crouched.squashY).toBeLessThan(0.9);
    expect(crouched.offset).toBe(0);
    const jumping = toBodyAt(harness, leavingAt + 300 + 300);
    expect(jumping.offset).toBeLessThan(-0.05);
    expect(jumping.angle).toBe(0);
    const diving = toBodyAt(harness, leavingAt + 300 + 400 + 600);
    expect(diving.angle).toBeLessThan(-60);
    expect(diving.angle).toBeGreaterThan(DIVE_ANGLE);
    expect(diving.offset).toBeGreaterThan(0.1);
    expect(toBodyAt(harness, leavingAt + 1500)).toEqual({
      offset: HIDDEN_OFFSET,
      angle: 0,
      squashX: 1,
      squashY: 1,
    });
  });

  it("bâille à 3 min, puis glisse vers le bas, puis est parti", async () => {
    const harness = build();
    await harness.run(179_900);
    expect(harness.timeline()).toEqual([]);
    await harness.run(10_000);
    expect(harness.timeline()).toEqual([
      { at: 180_000, label: "mode:yawn" },
      { at: 182_000, label: "presence:leaving" },
      { at: 182_000, label: "mode:idle" },
      { at: 183_500, label: "presence:away" },
    ]);
  });

  it("ne bâille pas une deuxième fois tant que rien ne le réveille", async () => {
    const harness = build();
    await harness.run(20 * 60_000);
    expect(harness.timeline().filter(({ label: name }) => name === "mode:yawn")).toHaveLength(1);
  });

  it("l'écrit dans le journal : il bâille, il est parti, il revient", async () => {
    const harness = build();
    await harness.run(190_000);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(harness.logs).toEqual([
      "Renard : il n'a pas parlé depuis un moment, il bâille puis s'en va.",
      "Renard : il est parti.",
      "Renard : il revient.",
    ]);
  });

  it("repart de zéro à la fin de chaque phrase : il bâille 3 min après la dernière", async () => {
    const harness = build();
    await harness.run(100_000);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(2400);
    const spoke = harness.timeline().find(({ label: name }) => name === "speech");
    const endedAt = (spoke?.at ?? 0) + 1000 + 400;
    await harness.run(178_000);
    expect(harness.timeline().some(({ label: name }) => name === "mode:yawn")).toBe(false);
    await harness.run(4000);
    const yawn = harness.timeline().find(({ label: name }) => name === "mode:yawn");
    expect(yawn?.at).toBe(endedAt + 180_000);
  });

  it("suit le délai réglé dans l'onglet Renard", async () => {
    const harness = build();
    harness.mode.update({ ...settings, foxAwayAfter: 60_000 });
    await harness.run(59_900);
    expect(harness.timeline()).toEqual([]);
    await harness.run(200);
    expect(harness.timeline()[0]).toEqual({ at: 60_000, label: "mode:yawn" });
  });

  it("l'image du bâillement est shut-yawn-cover pendant 2 s", async () => {
    const harness = build();
    await harness.run(185_000);
    const images = harness.toImages(harness.start + 180_100, harness.start + 181_900);
    expect(new Set(images)).toEqual(new Set(["shut-yawn-cover"]));
  });
});

describe("H : il revient en sautant", () => {
  it("revient dès qu'un message est accepté, saute 800 ms, puis fait coucou et lit", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(3000);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "mode:wave" });
    expect(timeline).toContainEqual({ at: 1800, label: "mode:idle" });
    expect(timeline).toContainEqual({ at: 1800, label: "speech" });
    const visible = timeline.find(({ label: name }) => name === "presence:visible");
    expect(visible?.at).toBeGreaterThanOrEqual(800);
    expect(visible?.at).toBeLessThanOrEqual(900);
  });

  it("ne lit qu'une fois revenu : la voix part après le saut et la réaction", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(1700);
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(200);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("revient aussi pour une réaction, sans coucou, quand le viewer a déjà été lu", async () => {
    const harness = build();
    await harness.wave("alice");
    await harness.run(AWAY_AT + 30_000);
    const since = harness.events.length;
    await harness.receive(message("2", "gg", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual([
      "presence:returning",
      "mode:reaction:front-smile-rest",
      "presence:visible",
      "mode:idle",
      "speech",
    ]);
  });

  it("ne revient pas pour un message ignoré par le filtre", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.receive(message("1", "!discord", { isCommand: true }));
    await harness.receive(message("2", "va voir https://exemple.com"));
    await harness.receive(message("3", "t'es un c0nn4rd"));
    await harness.run(5000);
    expect(harness.timeline(since)).toEqual([]);
  });

  it("ne revient pas quand Alexis parle seul", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["mode:listening"]);
  });

  it("revient sur « Faire parler » et dit la phrase une fois revenu", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    const pending = harness.mode.say("Une phrase d'Alexis");
    await harness.run(700);
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(200);
    expect((await pending).ok).toBe(true);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "speech" });
  });

  it("revient quand même quand Alexis parle, et lit seulement 1 s après son silence", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    await harness.talk(300);
    const since = harness.events.length;
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.talk(2000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("presence:returning");
    expect(harness.speeches()).toHaveLength(0);
    const lastLoud = harness.sim.now - 50;
    await harness.run(4000);
    const wave = harness.timeline(since).find(({ label: name }) => name === "mode:wave");
    expect((wave?.at ?? 0) + harness.start - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((wave?.at ?? 0) + harness.start - lastLoud).toBeLessThanOrEqual(1100);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("reste là, sans bâiller, quand un message est accepté pendant le bâillement", async () => {
    const harness = build();
    await harness.run(181_000);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(60_000);
    const names = harness.timeline().map(({ label: name }) => name);
    expect(names).not.toContain("presence:leaving");
    expect(names).not.toContain("presence:away");
  });

  it("ne part pas tant qu'un message attend dans la file, même si Alexis parle plus de 3 min", async () => {
    const harness = build();
    await harness.wave("alice");
    await harness.talk(500);
    await harness.receive(message("2", "J'attends", { viewerId: "alice" }));
    await harness.talk(200_000);
    const names = harness.timeline().map(({ label: name }) => name);
    expect(names).not.toContain("mode:yawn");
    expect(names).not.toContain("presence:leaving");
  });

  it("garde sa présence quand une page /fox se connecte : visible, il reste visible et ses 3 min ne repartent pas", async () => {
    const harness = build();
    await harness.run(100_000);
    harness.fox.subscribe("screen", () => undefined);
    expect(harness.fox.getPresence()).toEqual({ kind: "visible", elapsed: 100_000 });
    await harness.run(80_000);
    expect(harness.timeline()).toEqual([{ at: 180_000, label: "mode:yawn" }]);
  });

  it("garde sa présence quand une page /fox se connecte : parti, il reste parti", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    harness.fox.subscribe("screen", () => undefined);
    expect(harness.fox.getPresence().kind).toBe("away");
    await harness.run(10_000);
    expect(harness.timeline(since)).toEqual([]);
  });
});

describe("H : il démarre caché", () => {
  it("est caché au démarrage, sans bâiller ni plonger, et le reste tant que rien ne le réveille", async () => {
    const harness = build({ isHidden: true });
    expect(harness.fox.getPresence()).toEqual({ kind: "away", elapsed: 0 });
    await harness.run(20 * 60_000);
    expect(harness.timeline()).toEqual([]);
    expect(harness.fox.getPresence().kind).toBe("away");
    expect(harness.logs).toEqual([]);
  });

  it("garde sa présence quand une page /fox se connecte : caché, il reste caché et rien n'est publié", async () => {
    const harness = build({ isHidden: true });
    await harness.run(60_000);
    const since = harness.events.length;
    harness.fox.subscribe("screen", () => undefined);
    expect(harness.fox.getPresence()).toEqual({ kind: "away", elapsed: 60_000 });
    await harness.run(10_000);
    expect(harness.timeline(since)).toEqual([]);
  });

  it("revient en sautant au premier message accepté, puis fait coucou et lit", async () => {
    const harness = build({ isHidden: true });
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(3000);
    const timeline = harness.timeline();
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "mode:wave" });
    expect(timeline).toContainEqual({ at: 1800, label: "speech" });
  });

  it("revient sur « Faire parler » et dit la phrase une fois revenu", async () => {
    const harness = build({ isHidden: true });
    const pending = harness.mode.say("Une phrase d'Alexis");
    await harness.run(700);
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(200);
    expect((await pending).ok).toBe(true);
    expect(harness.timeline()).toContainEqual({ at: 0, label: "presence:returning" });
    expect(harness.timeline()).toContainEqual({ at: 800, label: "speech" });
  });
});

describe("le contrôleur : démarrage, arrêt et sans réglages", () => {
  it("n'a plus rien de programmé après l'arrêt, et n'écoute plus le micro", async () => {
    const harness = build();
    harness.foxChat.stop();
    harness.mode.stop();
    expect(harness.pendingTimers()).toBe(0);
    await harness.talk(1000);
    expect(harness.mode.getVoice().isTalking).toBe(false);
  });

  it("garde le retournement vers Fenysk jusqu'à la fin de la phrase : la phrase part après 150 ms, le mode reste jusqu'à cancel", async () => {
    const harness = build();
    await harness.run(1000);
    const since = harness.events.length;
    const intro = harness.mode.introduce({ kind: "address" });
    expect(harness.timeline(since)).toEqual([{ at: 1000, label: "mode:address" }]);
    let isReady = false;
    void intro.ready.then(() => {
      isReady = true;
    });
    await harness.run(149);
    expect(isReady).toBe(false);
    await harness.run(1);
    expect(isReady).toBe(true);
    await harness.run(20_000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["mode:address"]);
    intro.cancel();
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["mode:address", "mode:idle"]);
  });

  it("attend d'être revenu pour se retourner vers Fenysk : le saut d'abord, puis le retournement", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    const intro = harness.mode.introduce({ kind: "address" });
    let isReady = false;
    void intro.ready.then(() => {
      isReady = true;
    });
    await harness.run(799);
    expect(harness.timeline(since).some(({ label: name }) => name === "mode:address")).toBe(false);
    await harness.run(1);
    expect(harness.timeline(since).some(({ label: name }) => name === "mode:address")).toBe(true);
    expect(isReady).toBe(false);
    await harness.run(150);
    expect(isReady).toBe(true);
    intro.cancel();
  });

  it("annule l'entrée en scène d'un message supprimé avant sa lecture : plus de coucou à l'écran", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    harness.mode.introduce({ kind: "wave" }).cancel();
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["presence:returning"]);
    await harness.run(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:wave");
  });

  it("ne bouge pas sans les réglages du renard : tout est immédiat", async () => {
    const harness = build();
    harness.mode.update({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    const intro = harness.mode.introduce({ kind: "wave" });
    await expect(intro.ready).resolves.toBeUndefined();
    expect(harness.mode.wake()).toBe(0);
  });
});

// L'échelle horizontale du corps à l'instant `at` (relatif au démarrage), d'après les modes que la page a reçus : 1 regarde à
// gauche (le tchat), -1 est retourné vers Fenysk.
const toScaleAt = (harness: ReturnType<typeof build>, at: number): number => {
  let mirror = MIRROR_START;
  for (const { at: when, event } of harness.events) {
    const time = when - harness.start;
    if (event.kind === "mode" && time <= at) mirror = toNextMirror(mirror, isFacingFenysk(event.mode), time);
  }
  return toMirrorScale(mirror, at);
};

const JABS = ["Pique A", "Pique B", "Pique C"];
// 3 min sans parler, le bâillement (2 s) et le départ (1,5 s) : il est parti depuis 183,5 s, la pique est due 3 min plus tard.
const JAB_AT = 363_500;
// Démarré caché, il est « parti » depuis le démarrage : la pique est due 3 min plus tard.
const JAB_FROM_START_AT = 180_000;

const jabLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : il revient piquer Fenysk"));

describe("La relance : caché, il revient piquer Fenysk après 3 min de silence total", () => {
  it("ne revient pas tant que le silence ne dure pas 3 min depuis son départ, puis revient en sautant à la seconde près", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(JAB_AT - 100);
    expect(harness.speeches()).toHaveLength(0);
    expect(jabLines(harness)).toEqual([]);
    await harness.run(100);
    expect(jabLines(harness)).toHaveLength(1);
    const returning = harness
      .timeline()
      .find(({ at, label: name }) => name === "presence:returning" && at === JAB_AT);
    expect(returning).toBeDefined();
  });

  it("démarre caché sans piquer : il attend la première parole de Fenysk, puis revient en sautant 3 min après", async () => {
    const harness = build({ isHidden: true, jabs: JABS });
    await harness.run(JAB_FROM_START_AT + 600_000);
    expect(jabLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
    await harness.talk(1000);
    // Le pas de 100 ms qui suit les 3 min de silence, comptées depuis son dernier level.
    const returnAt = Math.ceil((harness.sim.now - 50 - harness.start + 180_000) / 100) * 100;
    await harness.run(returnAt - 100 - (harness.sim.now - harness.start));
    expect(jabLines(harness)).toEqual([]);
    await harness.run(100);
    expect(jabLines(harness)).toHaveLength(1);
    expect(harness.timeline()).toContainEqual({ at: returnAt, label: "presence:returning" });
  });

  it("revient en sautant, se tourne vers Fenysk (150 ms), dit la pique, puis se retourne", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 10_000);
    const timeline = harness.timeline().filter(({ at }) => at >= JAB_AT);
    expect(timeline).toContainEqual({ at: JAB_AT, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: JAB_AT + 800, label: "mode:address" });
    expect(timeline).toContainEqual({ at: JAB_AT + 950, label: "speech" });
    // La phrase dure 2 s, plus 400 ms de silence : le mode finit avec elle, le renard se retourne.
    expect(timeline).toContainEqual({ at: JAB_AT + 950 + 2000 + 400, label: "mode:idle" });
    expect(harness.speeches()).toHaveLength(1);
    // De profil au milieu du retournement, retourné pendant la phrase, de face de nouveau ensuite.
    expect(toScaleAt(harness, JAB_AT)).toBe(1);
    expect(toScaleAt(harness, JAB_AT + 875)).toBeCloseTo(0, 1);
    expect(toScaleAt(harness, JAB_AT + 950)).toBe(-1);
    expect(toScaleAt(harness, JAB_AT + 950 + 2000)).toBe(-1);
    expect(toScaleAt(harness, JAB_AT + 950 + 2400 + 75)).toBeCloseTo(0, 1);
    expect(toScaleAt(harness, JAB_AT + 950 + 2400 + 150)).toBe(1);
  });

  it("montre le regard à gauche pendant le retournement, que le miroir tourne vers Fenysk", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 3000);
    const images = harness.toImages(harness.start + JAB_AT + 820, harness.start + JAB_AT + 940);
    expect(new Set(images)).toEqual(new Set(["left-closed-rest"]));
  });

  it("dit une pique de la liste", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(JAB_AT + 1000);
    expect(JABS.some((jab) => jabLines(harness)[0]?.includes(`« ${jab} »`))).toBe(true);
  });

  it("ne repique pas avant 10 min, puis repique à la dixième minute si le silence dure", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(JAB_AT + 599_900);
    expect(jabLines(harness)).toHaveLength(1);
    expect(harness.speeches()).toHaveLength(1);
    await harness.run(100);
    expect(jabLines(harness)).toHaveLength(2);
    await harness.run(5000);
    expect(harness.speeches()).toHaveLength(2);
  });

  it("dit chaque pique avant d'en redire une", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(JAB_AT + 2 * 600_000 + 5000);
    const lines = jabLines(harness);
    expect(lines).toHaveLength(3);
    for (const jab of JABS) expect(lines.filter((line) => line.includes(`« ${jab} »`))).toHaveLength(1);
  });

  it("repart ensuite comme d'habitude : il repart 3 min après la fin de sa pique", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 950 + 2400 + 180_000 + 10_000);
    const names = harness.timeline().filter(({ at }) => at > JAB_AT + 3400);
    // La phrase finit à JAB_AT + 3350 + 400 ; le bâillement arrive au pas de 100 ms qui suit les 3 min.
    expect(names.find(({ label: name }) => name === "mode:yawn")?.at).toBe(
      JAB_AT + 950 + 2400 + 180_000 + 50,
    );
    expect(names.some(({ label: name }) => name === "presence:away")).toBe(true);
  });

  it("attend 3 min de plus quand le tchat dit quelque chose, même un message que le filtre ignore", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(300_000);
    await harness.receive(message("1", "!discord", { isCommand: true }));
    await harness.run(JAB_AT + 100_000 - 300_000);
    expect(jabLines(harness)).toEqual([]);
    await harness.run(300_000 + 180_000 - (JAB_AT + 100_000) - 100);
    expect(jabLines(harness)).toEqual([]);
    await harness.run(100);
    expect(jabLines(harness)).toHaveLength(1);
  });

  it("attend 3 min de plus quand Fenysk parle", async () => {
    const harness = build({ jabs: JABS });
    await harness.run(300_000);
    await harness.talk(1000);
    const silentSince = harness.sim.now - 50;
    await harness.run(179_000);
    expect(jabLines(harness)).toEqual([]);
    await harness.run(silentSince + 180_000 - harness.sim.now + 100);
    expect(jabLines(harness)).toHaveLength(1);
  });

  it("D s'applique : si Fenysk parle plus d'1 s, la pique s'arrête et ne reprend pas", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 6 });
    await harness.run(JAB_AT + 1500);
    expect(harness.speeches()).toHaveLength(1);
    const spokeAt = harness.sim.now;
    await harness.talk(2000);
    const stops = harness.events.filter(({ event }) => event.kind === "stop");
    expect(stops).toHaveLength(1);
    expect((stops[0]?.at ?? 0) - spokeAt).toBeGreaterThan(1000);
    expect((stops[0]?.at ?? 0) - spokeAt).toBeLessThanOrEqual(1200);
    // Le mode d'adresse s'efface avec la pique : il écoute Fenysk, puis revient au repos, et se retourne.
    await harness.run(2000);
    const names = harness.timeline().filter(({ at }) => at > JAB_AT + 1500);
    expect(names.map(({ label: name }) => name)).toContain("mode:listening");
    expect(names.map(({ label: name }) => name)).toContain("mode:idle");
    expect(toScaleAt(harness, harness.sim.now - harness.start)).toBe(1);
    await harness.run(120_000);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("ne pique pas quand la liste est vide", async () => {
    const harness = build({ isHeard: true, jabs: [] });
    await harness.run(JAB_AT * 3);
    expect(jabLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("n'interrompt pas un message du tchat : la pique passe par la même file, un message qui arrive pendant le retour passe après", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 100);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.run(15_000);
    expect(harness.speeches()).toHaveLength(2);
  });
});

describe("La prononciation, de bout en bout", () => {
  it("dit « gé gé » pour « gg » mais montre la réaction du texte écrit : le sourire, puis la lecture", async () => {
    const harness = build();
    await harness.wave("alice");
    const since = harness.events.length;
    const before = harness.synthesized.length;
    await harness.receive(message("2", "gg", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual([
      "mode:reaction:front-smile-rest",
      "mode:idle",
      "speech",
    ]);
    expect(harness.synthesized.slice(before)).toEqual(["gé gé"]);
  });

  it("dit « what the fuck » pour « wtf » dans un message du tchat", async () => {
    const harness = build();
    await harness.receive(message("1", "wtf", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.synthesized).toEqual(["what the fuck"]);
  });

  it("dit « Fénisque » pour « Fenysk » dans une pique, et dans « Faire parler »", async () => {
    const harness = build({ isHeard: true, jabs: ["Pourquoi Fenysk ne parle plus ?"] });
    await harness.run(363_500 + 3000);
    expect(harness.synthesized).toEqual(["Pourquoi Fénisque ne parle plus ?"]);
    const said = await harness.mode.say("Merci Fenysk");
    expect(said.ok).toBe(true);
    expect(harness.synthesized.at(-1)).toBe("Merci Fénisque");
  });

  it("garde l'ordre des mots et la ponctuation autour de l'abréviation", async () => {
    const harness = build();
    await harness.receive(message("1", "oh, wtf... vraiment ?", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.synthesized).toEqual(["oh, what the fuck... vraiment ?"]);
  });
});

// Le saut de joie que la page dessine à l'instant `at` (relatif au démarrage), d'après les modes reçus : il part du mode joy.
const toJoyAt = (harness: ReturnType<typeof build>, at: number) => {
  let joyAt: number | null = null;
  let current = "idle";
  for (const { at: when, event } of harness.events) {
    const time = when - harness.start;
    if (event.kind !== "mode" || time > at) continue;
    if (event.mode.kind === "joy" && current !== "joy") joyAt = time;
    current = event.mode.kind;
  }
  return current === "joy" && joyAt !== null ? toJoyBody(at - joyAt, settings.foxJoyDuration ?? 800) : NO_JOY;
};

describe("Les remerciements, de bout en bout", () => {
  it("remercie un follow : 1 s de sourire (front-smile-rest), puis la phrase", async () => {
    const harness = build();
    harness.thanks.receive({ kind: "follow", user: "Alice" });
    await harness.run(3000);
    expect(harness.timeline()).toEqual([
      { at: 0, label: "mode:reaction:front-smile-rest" },
      { at: 1000, label: "mode:idle" },
      { at: 1000, label: "speech" },
    ]);
    expect(harness.synthesized).toEqual(["Merci Alice pour le follow."]);
    expect(new Set(harness.toImages(harness.start + 50, harness.start + 950))).toEqual(
      new Set(["front-smile-rest"]),
    );
  });

  it("remercie des bits de la même façon : 1 s de sourire, puis la phrase avec le nombre de bits", async () => {
    const harness = build();
    await harness.live({ kind: "cheer", user: "Alice", bits: 100, message: null });
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual([
      "mode:reaction:front-smile-rest",
      "mode:idle",
      "speech",
    ]);
    expect(harness.synthesized).toEqual(["Merci Alice pour 100 bits."]);
  });

  it("remercie un raid : 3 s de long coucou (les deux images du coucou), puis la phrase au tchat", async () => {
    const harness = build();
    await harness.live({ kind: "raid", user: "Alice", viewers: 12 });
    await harness.run(5000);
    expect(harness.timeline()).toEqual([
      { at: 0, label: "mode:raid" },
      { at: 3000, label: "mode:idle" },
      { at: 3000, label: "speech" },
    ]);
    expect(harness.synthesized).toEqual(["Alice débarque avec 12 personnes."]);
    expect(new Set(harness.toImages(harness.start + 50, harness.start + 2950))).toEqual(
      new Set(["front-smile-wave", "front-small-wave"]),
    );
  });

  it("remercie un sub par un saut de joie de 800 ms (il saute puis retombe à sa taille), puis la phrase", async () => {
    const harness = build();
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(3000);
    expect(harness.timeline()).toEqual([
      { at: 0, label: "mode:joy" },
      { at: 800, label: "mode:idle" },
      { at: 800, label: "speech" },
    ]);
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub."]);
    expect(toJoyAt(harness, 100).squashY).toBeLessThan(1);
    expect(toJoyAt(harness, 400).offset).toBeLessThan(-0.08);
    expect(toJoyAt(harness, 800)).toEqual(NO_JOY);
    expect(new Set(harness.toImages(harness.start + 50, harness.start + 750))).toEqual(
      new Set(["front-smile-rest"]),
    );
  });

  it("remercie un sub offert avec son destinataire, par un saut de joie", async () => {
    const harness = build();
    await harness.live({ kind: "gift", user: "Alice", recipient: "Bob" });
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["mode:joy", "mode:idle", "speech"]);
    expect(harness.synthesized).toEqual(["Alice offre un sub à Bob."]);
  });

  it("remercie une série de 5 subs offerts par UNE phrase", async () => {
    const harness = build();
    await harness.live({ kind: "mystery-gift", user: "Alice", count: 5 });
    await harness.run(8000);
    expect(harness.synthesized).toEqual(["Alice offre 5 subs."]);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("revient en sautant s'il était parti, saute de joie, puis remercie", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(4000);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "mode:joy" });
    expect(timeline).toContainEqual({ at: 1600, label: "speech" });
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub."]);
  });

  it("réveiller le renard caché : il revient en sautant, puis dit « Quoi ?! Je dormais » au tchat, sans rien montrer d'autre", async () => {
    const harness = build({ overrides: { foxThanksWakeAsleep: ["Quoi ?! Je dormais, moi !"] } });
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Réveiller Jean-Renard",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(4000);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "speech" });
    expect(timeline.filter(({ label: name }) => name.startsWith("mode:"))).toEqual([]);
    expect(harness.synthesized).toEqual(["Quoi ?! Je dormais, moi !"]);
  });

  it("réveiller le renard visible : il dit « Je dors pas » tout de suite", async () => {
    const harness = build();
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Réveiller Jean-Renard",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["speech"]);
    expect(harness.synthesized).toEqual(["Je dors pas, Alice. Je réfléchis."]);
  });

  it("n'est pas coupé quand Fenysk parle plus d'1 s : le remerciement va au bout", async () => {
    const harness = build({ seconds: 3 });
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(1000);
    await harness.talk(2000);
    await harness.run(3000);
    expect(harness.events.some(({ event }) => event.kind === "stop")).toBe(false);
    expect(harness.logs.some((line) => line.includes("lecture abandonnée"))).toBe(false);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("attend le silence de Fenysk : il ne se montre ni ne parle tant qu'il parle, puis 1 s après", async () => {
    const harness = build();
    await harness.talk(2000);
    const talkEnd = harness.sim.now - harness.start;
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(500);
    expect(harness.timeline().some(({ label: name }) => name === "mode:joy")).toBe(false);
    await harness.run(3000);
    const joy = harness.timeline().find(({ label: name }) => name === "mode:joy");
    expect(joy?.at).toBeGreaterThanOrEqual(talkEnd + 1000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub."]);
  });

  it("passe devant un message du tchat qui attendait", async () => {
    const harness = build();
    await harness.talk(300);
    await harness.receive(message("1", "Bonjour tout le monde", { viewerId: "bob" }));
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(10_000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub.", "Bonjour tout le monde"]);
  });

  it("ne dit pas le pseudo d'un follow insultant : la phrase sans pseudo", async () => {
    const harness = build();
    harness.thanks.receive({ kind: "follow", user: "connard42" });
    await harness.run(3000);
    expect(harness.synthesized).toEqual(["Merci aux nouveaux followers."]);
  });

  it("dit « quelqu'un » à la place d'un pseudo insultant ailleurs, destinataire compris", async () => {
    const harness = build();
    await harness.live({ kind: "sub", user: "salope", message: null });
    await harness.run(4000);
    await harness.live({ kind: "gift", user: "Alice", recipient: "connard" });
    await harness.run(4000);
    expect(harness.synthesized).toEqual(["Merci quelqu'un pour le sub.", "Alice offre un sub à quelqu'un."]);
    expect(harness.synthesized.join(" ")).not.toMatch(/salope|connard/);
  });

  it("regroupe une rafale de 10 follows : une phrase nommée, puis UNE phrase groupée 10 s après", async () => {
    const harness = build();
    for (let index = 0; index < 10; index += 1) {
      harness.thanks.receive({ kind: "follow", user: `Bot${index}` });
      await harness.run(200);
    }
    await harness.run(20_000);
    expect(harness.synthesized).toEqual(["Merci Bot0 pour le follow.", "Merci aux nouveaux followers."]);
    expect(harness.speeches()).toHaveLength(2);
  });

  it("lit le message d'un resub juste après son remerciement, et dit « Fénisque » pour « Fenysk »", async () => {
    const harness = build();
    await harness.live({
      kind: "sub",
      user: "Alice",
      message: message("9", "Bravo Fenysk pour le live", { viewerId: "alice" }),
    });
    await harness.run(10_000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub.", "Bravo Fénisque pour le live"]);
  });

  it("lit le message d'un cheer sans ses cheermotes, et rien quand il n'en reste pas", async () => {
    const harness = build();
    await harness.live({
      kind: "cheer",
      user: "Alice",
      bits: 100,
      message: message("9", "Cheer100 super stream", { viewerId: "alice" }),
    });
    await harness.run(10_000);
    expect(harness.synthesized).toEqual(["Merci Alice pour 100 bits.", "super stream"]);
    await harness.live({
      kind: "cheer",
      user: "Bob",
      bits: 50,
      message: message("10", "Cheer50", { viewerId: "bob" }),
    });
    await harness.run(10_000);
    expect(harness.synthesized).toHaveLength(3);
  });

  it("n'est soumis ni au délai par viewer ni à « Lire le tchat » (mais le message joint, si)", async () => {
    const harness = build({ overrides: { foxShouldReadChat: false } });
    await harness.live({
      kind: "sub",
      user: "Alice",
      message: message("9", "Merci pour tout", { viewerId: "alice" }),
    });
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(10_000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le sub.", "Merci Alice pour le sub."]);
  });

  it("ne remercie rien, et ne réveille pas le renard parti, quand la case est décochée", async () => {
    const harness = build({ overrides: { foxShouldThank: false } });
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.live({ kind: "sub", user: "Alice", message: null });
    harness.thanks.receive({ kind: "follow", user: "Bob" });
    await harness.run(5000);
    expect(harness.timeline(since)).toEqual([]);
    expect(harness.synthesized).toEqual([]);
  });

  it("écrit {viewers} quand le nombre est connu", async () => {
    const harness = build({
      viewers: 42,
      overrides: { foxThanksFollow: ["On est {viewers}, merci {user}."] },
    });
    harness.thanks.receive({ kind: "follow", user: "Alice" });
    await harness.run(3000);
    expect(harness.synthesized).toEqual(["On est 42, merci Alice."]);
  });

  it("ne tire jamais une phrase de {viewers} quand le nombre est inconnu", async () => {
    const harness = build({
      viewers: null,
      overrides: { foxThanksFollow: ["On est {viewers}, merci {user}.", "Merci {user}."] },
    });
    for (let index = 0; index < 4; index += 1) {
      harness.thanks.receive({ kind: "follow", user: `Viewer${index}` });
      await harness.run(11_000);
    }
    expect(harness.synthesized).toHaveLength(4);
    for (const text of harness.synthesized) expect(text).toMatch(/^Merci Viewer\d\.$/);
  });

  it("repart 3 min après le remerciement, comme après toute phrase", async () => {
    const harness = build();
    await harness.live({ kind: "sub", user: "Alice", message: null });
    await harness.run(3000);
    const since = harness.events.length;
    await harness.run(185_000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("presence:away");
  });
});

const SHOUTS = ["Doucement ! J'ai des oreilles de renard, moi."];

const shoutLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : Fenysk crie"));

describe("Y : les prédictions", () => {
  it("dit au tchat les perdants et l'issue, sans rien montrer avant", async () => {
    const harness = build();
    await harness.live({ kind: "prediction", losers: 12, outcome: "Victoire" });
    await harness.run(3000);
    expect(harness.timeline().map(({ label: name }) => name)).toEqual(["speech"]);
    expect(harness.synthesized).toEqual(["Perdants sur « Victoire » : 12 personnes. Courage."]);
  });

  it("revient en sautant s'il était parti, puis dit que tout le monde a gagné", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.live({ kind: "prediction", losers: 0, outcome: null });
    await harness.run(4000);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "speech" });
    expect(harness.synthesized).toEqual(["Tout le monde a gagné. C'est louche."]);
  });
});

describe("X : « Clasher Fenysk »", () => {
  it("caché, il revient en sautant, se tourne vers Fenysk et dit l'intro puis une pique", async () => {
    const harness = build({ jabs: ["Une seule pique."], seconds: 2 });
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Clasher Fenysk",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(6000);
    const timeline = harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - AWAY_AT }));
    expect(timeline).toContainEqual({ at: 0, label: "presence:returning" });
    expect(timeline).toContainEqual({ at: 800, label: "mode:address" });
    expect(timeline).toContainEqual({ at: 950, label: "speech" });
    expect(harness.synthesized).toEqual(["Alice m'a payé pour te dire ça : Une seule pique."]);
  });

  it("attend le silence de Fenysk : rien tant qu'il parle, la pique 1 s après", async () => {
    const harness = build({ jabs: ["Une seule pique."], seconds: 2 });
    await harness.talk(1000);
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Clasher Fenysk",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.talk(2000);
    expect(harness.speeches()).toHaveLength(0);
    expect(harness.logs.some((line) => line.includes("lecture abandonnée"))).toBe(false);
    await harness.run(3000);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("s'arrête, pour ne pas reprendre, si Fenysk parle plus d'1 s pendant la pique", async () => {
    const harness = build({ jabs: ["Une seule pique."], seconds: 5 });
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Clasher Fenysk",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(1000);
    await harness.talk(2500);
    await harness.run(8000);
    expect(harness.logs).toContain("Renard : lecture abandonnée, Alexis parle (pique (récompense)).");
    expect(harness.events.some(({ event }) => event.kind === "stop")).toBe(true);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("ne dit pas le pseudo d'un viewer insultant : « quelqu'un m'a payé pour te dire ça »", async () => {
    const harness = build({ jabs: ["Une seule pique."] });
    await harness.live({
      kind: "reward",
      user: "connard42",
      title: "Clasher Fenysk",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(4000);
    expect(harness.synthesized).toEqual(["quelqu'un m'a payé pour te dire ça : Une seule pique."]);
  });

  it("ignore une autre récompense : rien ne bouge, rien ne se dit", async () => {
    const harness = build({ jabs: ["Une seule pique."] });
    await harness.live({
      kind: "reward",
      user: "Alice",
      title: "Hydrate-toi",
      id: "red-1",
      rewardId: "reward-1",
    });
    await harness.run(4000);
    expect(harness.speeches()).toHaveLength(0);
    expect(harness.timeline()).toEqual([]);
  });
});

describe("K : il sursaute quand Fenysk crie", () => {
  it("se tourne vers Fenysk, la tête choquée, pendant 1 s, sans rien dire", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    const since = harness.events.length;
    const at = harness.sim.now - harness.start;
    await harness.cry(500);
    await harness.run(3000);
    expect(harness.timeline(since)).toEqual([
      { at, label: "mode:flinch" },
      { at: at + 1000, label: "mode:idle" },
    ]);
    expect(harness.speeches()).toHaveLength(0);
    expect(shoutLines(harness)).toEqual([]);
  });

  it("montre left-large-rest pendant tout le sursaut, retourné vers la droite", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    const at = harness.sim.now - harness.start;
    await harness.cry(300);
    await harness.run(3000);
    const images = harness.toImages(harness.start + at + 200, harness.start + at + 990);
    expect(new Set(images)).toEqual(new Set(["left-large-rest"]));
    expect(toScaleAt(harness, at)).toBe(1);
    expect(toScaleAt(harness, at + 75)).toBeCloseTo(0, 1);
    expect(toScaleAt(harness, at + 400)).toBe(-1);
    expect(toScaleAt(harness, at + 1000 + 150)).toBe(1);
  });

  it("sursaute à chaque cri, à plus d'1 s d'écart", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.cry(200);
    await harness.run(1500);
    await harness.cry(200);
    await harness.run(3000);
    const flinches = harness.timeline(since).filter(({ label: name }) => name === "mode:flinch");
    expect(flinches).toHaveLength(2);
  });

  it("ne sursaute qu'une fois pour deux cris à moins d'1 s d'écart", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.cry(200);
    await harness.run(700);
    await harness.cry(200);
    await harness.run(3000);
    expect(harness.timeline(since).filter(({ label: name }) => name === "mode:flinch")).toHaveLength(1);
  });

  it("ne bouge pas pour une voix forte sous le seuil de cri", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.talk(2000);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:flinch");
  });

  it("ne revient pas et ne compte pas quand il est caché : trois cris de suite ne disent rien", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(AWAY_AT + 1000);
    const since = harness.events.length;
    for (let cries = 0; cries < 3; cries += 1) {
      await harness.cry(200);
      await harness.run(5000);
    }
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).not.toContain("mode:flinch");
    expect(names).not.toContain("presence:returning");
    expect(harness.speeches()).toHaveLength(0);
    expect(shoutLines(harness)).toEqual([]);
  });

  it("dit sa phrase tournée vers Fenysk au troisième cri en 2 min, 1 s après son silence", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    await harness.cry(200);
    await harness.run(20_000);
    await harness.cry(200);
    await harness.run(20_000);
    expect(harness.speeches()).toHaveLength(0);
    const since = harness.events.length;
    await harness.cry(200);
    const lastLoud = harness.sim.now - 50;
    await harness.run(6000);
    expect(shoutLines(harness)).toEqual([`Renard : Fenysk crie, il proteste : « ${SHOUTS[0]} »`]);
    expect(harness.synthesized).toEqual([SHOUTS[0]]);
    const speech = harness.speeches()[0];
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((speech?.at ?? 0) - lastLoud).toBeLessThanOrEqual(1500);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).toContain("mode:address");
    expect(names.at(-1)).toBe("mode:idle");
  });

  it("dit sa phrase quand un cri dure plus de 3 s, après la fin du cri", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    await harness.cry(4000);
    const lastLoud = harness.sim.now - 50;
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(4000);
    expect(harness.speeches()).toHaveLength(1);
    expect((harness.speeches()[0]?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
  });

  it("ne dit rien pour deux cris, ni pour trois cris séparés de plus de 2 min", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.run(10_000);
    await harness.cry(200);
    await harness.run(60_000);
    await harness.cry(200);
    await harness.run(60_000);
    // Le premier cri a plus de 2 min quand le troisième arrive : il n'en reste que deux dans la période.
    await harness.cry(200);
    await harness.run(10_000);
    expect(shoutLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("n'est pas coupée quand Fenysk reparle plus d'1 s : elle va au bout", async () => {
    const harness = build({ shouts: SHOUTS, seconds: 6 });
    await harness.run(10_000);
    await harness.cry(4000);
    await harness.run(1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("passe devant un message du tchat qui attendait", async () => {
    const harness = build({ shouts: SHOUTS });
    await harness.wave("alice");
    await harness.cry(4000);
    await harness.receive(message("2", "Bonjour tout le monde", { viewerId: "alice" }));
    const before = harness.synthesized.length;
    await harness.run(8000);
    expect(harness.synthesized.slice(before, before + 2)).toEqual([SHOUTS[0], "Bonjour tout le monde"]);
  });

  it("au plus une phrase de cri toutes les 10 min", async () => {
    const harness = build({ shouts: SHOUTS, overrides: { foxAwayAfter: 3_600_000 } });
    await harness.run(10_000);
    await harness.cry(4000);
    await harness.run(20_000);
    await harness.cry(4000);
    await harness.run(20_000);
    expect(shoutLines(harness)).toHaveLength(1);
    await harness.run(600_000);
    await harness.cry(4000);
    expect(shoutLines(harness)).toHaveLength(2);
  });

  it("n'écrase pas le retournement vers Fenysk d'une phrase : le contrôleur ne montre rien d'autre par-dessus", async () => {
    const harness = build();
    const intro = harness.mode.introduce(ADDRESS_MODE);
    await harness.run(300);
    expect(harness.mode.flash(FLINCH_MODE)).toBe(0);
    intro.cancel();
    expect(harness.mode.flash(FLINCH_MODE)).toBe(1000);
  });

  it("ne montre pas de sursaut tant qu'il est parti, et n'en montre plus après l'arrêt du contrôleur", async () => {
    const harness = build();
    await harness.run(AWAY_AT + 1000);
    expect(harness.mode.flash(FLINCH_MODE)).toBe(0);
    harness.mode.wake();
    await harness.run(1000);
    const since = harness.events.length;
    expect(harness.mode.flash(FLINCH_MODE)).toBe(1000);
    harness.mode.stop();
    await harness.run(2000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["mode:flinch"]);
  });

  it("sursaute de nouveau quand un cri arrive pendant un sursaut : la fin repart", async () => {
    const harness = build();
    await harness.run(10_000);
    expect(harness.mode.flash(FLINCH_MODE)).toBe(1000);
    await harness.run(600);
    expect(harness.mode.flash(FLINCH_MODE)).toBe(1000);
    const since = harness.events.length;
    await harness.run(900);
    expect(harness.timeline(since)).toEqual([]);
    await harness.run(200);
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["mode:idle"]);
  });

  it("sursaute sans rien dire quand la liste des phrases de cri est vide", async () => {
    const harness = build({ shouts: [] });
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.cry(4000);
    await harness.run(5000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("mode:flinch");
    expect(harness.speeches()).toHaveLength(0);
  });
});

const TO_FENYSK = ["Tu respires, des fois ?"];
const TO_CHAT = ["Je crois que Fenysk nous tunnel."];

const tunnelLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : Fenysk parle sans s'arrêter"));

describe("L : Fenysk parle trop longtemps", () => {
  it("bâille 2 s (shut-yawn-cover) quand Fenysk parle depuis 3 min, sans partir, puis attend son silence pour parler", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK });
    await harness.talk(179_000);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:yawn");
    await harness.talk(4000);
    const timeline = harness.timeline();
    const yawn = timeline.find(({ label: name }) => name === "mode:yawn");
    expect(yawn).toBeDefined();
    expect(yawn?.at).toBeGreaterThanOrEqual(180_000);
    expect(yawn?.at).toBeLessThan(181_000);
    const after = timeline.find(({ at }) => at > (yawn?.at ?? 0));
    expect(after).toEqual({ at: (yawn?.at ?? 0) + 2000, label: "mode:listening" });
    const images = harness.toImages(
      harness.start + (yawn?.at ?? 0) + 100,
      harness.start + (yawn?.at ?? 0) + 1900,
    );
    expect(new Set(images)).toEqual(new Set(["shut-yawn-cover"]));
    expect(timeline.map(({ label: name }) => name)).not.toContain("presence:leaving");
    expect(harness.speeches()).toHaveLength(0);
    expect(tunnelLines(harness)).toHaveLength(1);
  });

  it("dit sa phrase tournée vers Fenysk 1 s après son silence", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK });
    await harness.talk(182_000);
    const since = harness.events.length;
    const lastLoud = harness.sim.now - 50;
    await harness.run(5000);
    const speech = harness.speeches()[0];
    expect(harness.synthesized).toEqual(TO_FENYSK);
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((speech?.at ?? 0) - lastLoud).toBeLessThanOrEqual(1500);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("mode:address");
  });

  it("dit une phrase du tchat vers la gauche, sans se retourner", async () => {
    const harness = build({ tunnelToChat: TO_CHAT });
    await harness.talk(182_000);
    const since = harness.events.length;
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Je crois que Fénisque nous tunnel."]);
    expect(harness.speeches()).toHaveLength(1);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:address");
  });

  it("n'est pas coupée quand Fenysk reparle plus d'1 s : elle va au bout", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK, seconds: 6 });
    await harness.talk(182_000);
    await harness.run(1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
  });

  it("ne le déclenche pas quand Fenysk se tait plus de 5 s au milieu : les 3 min repartent de zéro", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK });
    await harness.talk(100_000);
    await harness.run(5100);
    await harness.talk(100_000);
    expect(tunnelLines(harness)).toEqual([]);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:yawn");
  });

  it("continue après une pause de 4 s : 3 min de parole en deux morceaux comptent", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK });
    await harness.talk(100_000);
    await harness.run(4000);
    await harness.talk(85_000);
    expect(tunnelLines(harness)).toHaveLength(1);
  });

  it("revient en sautant, sans bâiller, s'il était parti, pour dire sa phrase", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK });
    await harness.run(AWAY_AT + 6000);
    const since = harness.events.length;
    await harness.talk(182_000);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).toContain("presence:returning");
    expect(names).not.toContain("mode:yawn");
    await harness.run(6000);
    expect(harness.speeches()).toHaveLength(1);
    expect(harness.synthesized).toEqual(TO_FENYSK);
  });

  it("ne le déclenche pas deux fois avant 10 min de parole, et repart de zéro après", async () => {
    const harness = build({ tunnelToFenysk: TO_FENYSK, tunnelToChat: TO_CHAT, seconds: 1 });
    await harness.talk(770_000);
    expect(tunnelLines(harness)).toHaveLength(1);
    await harness.talk(20_000);
    expect(tunnelLines(harness)).toHaveLength(2);
  });

  it("dit chaque phrase des deux listes avant d'en redire une", async () => {
    const harness = build({ tunnelToFenysk: ["A", "B"], tunnelToChat: ["C"] });
    await harness.talk(3 * 600_000 + 10_000);
    const phrases = tunnelLines(harness).map((line) => /« (.+) »/.exec(line)?.[1]);
    expect(phrases.slice(0, 3).sort()).toEqual(["A", "B", "C"]);
  });

  it("ne bâille ni ne parle quand les deux listes sont vides", async () => {
    const harness = build();
    await harness.talk(200_000);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:yawn");
    expect(tunnelLines(harness)).toEqual([]);
  });
});

const BACK_TO_FENYSK = ["{absence} d'absence, Fenysk. Tu nous racontes ?"];
const BACK_TO_CHAT = ["Ah, il est de retour le boug !"];

const comebackLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : Fenysk revient après"));

describe("T : Fenysk revient d'une absence", () => {
  it("ne salue pas sa première parole après le démarrage, même après 10 min sans l'entendre", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.run(600_000);
    await harness.talk(3000);
    await harness.run(6000);
    expect(comebackLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("le salue à son retour après 5 min de silence, en disant la durée de l'absence", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.talk(3000);
    await harness.run(300_000);
    expect(comebackLines(harness)).toEqual([]);
    await harness.talk(2000);
    await harness.run(6000);
    expect(comebackLines(harness)).toHaveLength(1);
    expect(harness.synthesized).toEqual(["5 minutes d'absence, Fénisque. Tu nous racontes ?"]);
  });

  it("ne le salue pas pour une toux : l'absence continue jusqu'à 1 s de voix, et dit toute sa durée", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.talk(3000);
    await harness.run(300_000);
    await harness.talk(100);
    await harness.run(120_000);
    expect(comebackLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
    await harness.talk(2000);
    await harness.run(6000);
    expect(comebackLines(harness)).toHaveLength(1);
    expect(harness.synthesized).toEqual(["7 minutes d'absence, Fénisque. Tu nous racontes ?"]);
  });

  it("ne le salue pas après 4 min 59 de silence", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.talk(3000);
    await harness.run(298_000);
    await harness.talk(2000);
    await harness.run(6000);
    expect(comebackLines(harness)).toEqual([]);
  });

  it("le salue après un micro coupé dans OBS (level à -100 dB) puis rouvert", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.talk(2000);
    await harness.sound(600_000, { voice: -100, game: null });
    expect(comebackLines(harness)).toEqual([]);
    await harness.talk(2000);
    await harness.run(6000);
    expect(comebackLines(harness)).toHaveLength(1);
    expect(harness.synthesized).toEqual(["10 minutes d'absence, Fénisque. Tu nous racontes ?"]);
  });

  it("revient en sautant, tourné vers lui, puis parle 1 s après son silence", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK });
    await harness.talk(3000);
    await harness.run(300_000);
    const since = harness.events.length;
    await harness.talk(2000);
    const lastLoud = harness.sim.now - 50;
    await harness.run(6000);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).toContain("presence:returning");
    expect(names).toContain("mode:address");
    expect(names).not.toContain("mode:yawn");
    const speech = harness.speeches()[0];
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((speech?.at ?? 0) - lastLoud).toBeLessThanOrEqual(1500);
  });

  it("dit une phrase du tchat vers la gauche, sans se retourner", async () => {
    const harness = build({ comebackToChat: BACK_TO_CHAT });
    await harness.talk(3000);
    await harness.run(300_000);
    const since = harness.events.length;
    await harness.talk(2000);
    await harness.run(6000);
    expect(harness.synthesized).toEqual(BACK_TO_CHAT);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:address");
  });

  it("n'est pas coupée quand Fenysk reparle plus d'1 s : elle va au bout", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK, seconds: 6 });
    await harness.talk(3000);
    await harness.run(300_000);
    await harness.talk(2000);
    await harness.run(1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
  });

  it("ne dit qu'une phrase par absence, même s'il parle ensuite longtemps", async () => {
    const harness = build({ comebackToFenysk: BACK_TO_FENYSK, comebackToChat: BACK_TO_CHAT });
    await harness.talk(3000);
    await harness.run(300_000);
    await harness.talk(60_000);
    await harness.run(6000);
    expect(comebackLines(harness)).toHaveLength(1);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("dit chaque phrase des deux listes avant d'en redire une", async () => {
    const harness = build({ comebackToFenysk: ["A", "B"], comebackToChat: ["C"] });
    await harness.talk(3000);
    for (let round = 0; round < 3; round += 1) {
      await harness.run(300_000);
      await harness.talk(2000);
    }
    await harness.run(6000);
    const phrases = comebackLines(harness).map((line) => /« (.+) »/.exec(line)?.[1]);
    expect(phrases.slice(0, 3).sort()).toEqual(["A", "B", "C"]);
  });

  it("ne dit rien case décochée, ni quand les deux listes sont vides", async () => {
    const unchecked = build({
      comebackToFenysk: BACK_TO_FENYSK,
      overrides: { foxShouldHailComeback: false },
    });
    await unchecked.talk(3000);
    await unchecked.run(300_000);
    await unchecked.talk(2000);
    await unchecked.run(6000);
    expect(comebackLines(unchecked)).toEqual([]);
    const empty = build();
    await empty.talk(3000);
    await empty.run(300_000);
    await empty.talk(2000);
    await empty.run(6000);
    expect(comebackLines(empty)).toEqual([]);
    expect(empty.speeches()).toHaveLength(0);
  });
});

const ALERTS = ["Fenysk, le jeu parle plus fort que toi !"];

const balanceLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : le son du PC couvre"));

describe("N : la balance du son", () => {
  it("alerte Fenysk, tourné vers lui, quand le jeu couvre sa voix pendant 10 s de parole, 1 s après son silence", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(9000, { voice: -15, game: -15 });
    expect(balanceLines(harness)).toEqual([]);
    await harness.sound(2000, { voice: -15, game: -15 });
    expect(balanceLines(harness)).toHaveLength(1);
    expect(harness.speeches()).toHaveLength(0);
    const since = harness.events.length;
    const lastLoud = harness.sim.now - 50;
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Fénisque, le jeu parle plus fort que toi !"]);
    const speech = harness.speeches()[0];
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    expect((speech?.at ?? 0) - lastLoud).toBeLessThanOrEqual(1500);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("mode:address");
  });

  it("alerte aussi quand le jeu est plus fort que la voix", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(11_000, { voice: -20, game: -8 });
    expect(balanceLines(harness)).toHaveLength(1);
  });

  it("n'alerte pas tant que la voix de Fenysk reste devant le son du PC", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(60_000, { voice: -15, game: -30 });
    expect(balanceLines(harness)).toEqual([]);
  });

  it("n'alerte pas quand Fenysk se tait : un jeu fort est normal", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(60_000, { voice: null, game: -5 });
    expect(balanceLines(harness)).toEqual([]);
  });

  it("cumule la parole : 6 s de voix, un silence, puis 5 s de voix sous un jeu fort", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(6000, { voice: -15, game: -15 });
    await harness.sound(3000, { voice: null, game: -5 });
    expect(balanceLines(harness)).toEqual([]);
    await harness.sound(5000, { voice: -15, game: -15 });
    expect(balanceLines(harness)).toHaveLength(1);
  });

  it("revient en sautant s'il était parti, pour l'alerte", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.run(AWAY_AT + 6000);
    const since = harness.events.length;
    await harness.sound(11_000, { voice: -15, game: -15 });
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("presence:returning");
    await harness.run(6000);
    expect(harness.synthesized).toEqual(["Fénisque, le jeu parle plus fort que toi !"]);
  });

  it("n'est pas coupée quand Fenysk reparle plus d'1 s : elle va au bout", async () => {
    const harness = build({ balanceAlerts: ALERTS, seconds: 6 });
    await harness.sound(11_000, { voice: -15, game: -15 });
    await harness.run(1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await harness.sound(3000, { voice: -15, game: -30 });
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
  });

  it("au plus une alerte toutes les 5 min", async () => {
    const harness = build({ balanceAlerts: ALERTS });
    await harness.sound(290_000, { voice: -15, game: -15 });
    expect(balanceLines(harness)).toHaveLength(1);
    await harness.sound(30_000, { voice: -15, game: -15 });
    expect(balanceLines(harness)).toHaveLength(2);
  });

  it("ne dit rien quand la liste des alertes est vide", async () => {
    const harness = build({ balanceAlerts: [] });
    await harness.sound(60_000, { voice: -15, game: -5 });
    expect(balanceLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });
});

// L'heure du PC dans ces tests : un soir d'octobre, à l'heure locale.
const at = (hours: number, minutes = 0, day = 14): number => new Date(2026, 9, day, hours, minutes).getTime();
// La fin prévue telle que le réglage la garde : le texte ISO de l'instant.
const endAt = (hours: number, minutes = 0, day = 14): string =>
  new Date(at(hours, minutes, day)).toISOString();

describe("M : il tient l'heure du live", () => {
  it("revient pour une heure pleine de live, tourné vers le tchat, même parti", async () => {
    const harness = build({
      startAt: at(21),
      hours: { foxHourPhrases: ["Ding ! {heures} de live."] },
    });
    harness.updateBroadcast({ isLive: true, duration: 3_300_000 });
    await harness.run(299_000);
    expect(harness.speeches()).toHaveLength(0);
    const since = harness.events.length;
    await harness.run(3000);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).toContain("presence:returning");
    expect(names).not.toContain("mode:address");
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Ding ! 1 heure de live."]);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("ne compte que pendant la diffusion : OBS ne la lance pas, il ne dit rien", async () => {
    const harness = build({
      startAt: at(21),
      hours: {
        foxHourPhrases: ["Ding ! {heures} de live."],
        foxEndAt: endAt(21, 5),
        foxEndPhrases: ["Fin."],
      },
    });
    harness.updateBroadcast({ isLive: false, duration: 0 });
    await harness.run(600_000);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("attend le silence de Fenysk, et sa voix ne coupe pas l'annonce", async () => {
    const harness = build({
      startAt: at(21),
      seconds: 4,
      hours: { foxHourPhrases: ["Ding ! {heures} de live."] },
    });
    harness.updateBroadcast({ isLive: true, duration: 3_595_000 });
    await harness.talk(10_000);
    expect(harness.speeches()).toHaveLength(0);
    const lastLoud = harness.sim.now - 50;
    await harness.run(1500);
    const speech = harness.speeches()[0];
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(1000);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
  });

  it("déroule la fin prévue : l'avertissement, la fin, deux rappels, le coucher, puis plus rien", async () => {
    const harness = build({
      startAt: at(23, 40),
      hours: {
        foxEndAt: endAt(0, 0, 15),
        foxEndWarningMarks: ["10"],
        foxEndSoonPhrases: ["Plus que {minutes} minutes."],
        foxEndPhrases: ["{fin}. Le live est fini."],
        foxOvertimePhrases: ["Il est {maintenant}, {retard} de rab."],
        foxBedtimePhrases: ["Je vais me coucher."],
      },
    });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await harness.run(51 * 60_000);
    expect(harness.synthesized).toEqual([
      "Plus que 10 minutes.",
      "Minuit. Le live est fini.",
      "Il est minuit 10, 10 minutes de rab.",
      "Il est minuit 20, 20 minutes de rab.",
      "Je vais me coucher.",
    ]);
    const timeline = harness.timeline();
    const names = timeline.map(({ label: name }) => name);
    expect(names.filter((name) => name === "mode:address")).toHaveLength(5);
    expect(names.filter((name) => name === "presence:returning").length).toBeGreaterThanOrEqual(4);
    // Après le coucher : il bâille, glisse hors de la source, puis est parti, et ne rappelle plus rien.
    const bedtime = timeline.findLast(({ label: name }) => name === "speech");
    const afterwards = timeline
      .filter(({ at: when }) => when > (bedtime?.at ?? 0))
      .map(({ label: name }) => name);
    expect(afterwards).toContain("presence:leaving");
    expect(afterwards.at(-1)).toBe("presence:away");
    const speechCount = harness.speeches().length;
    await harness.run(40 * 60_000);
    expect(harness.speeches()).toHaveLength(speechCount);
  });

  it("revient quand un message du tchat arrive, après son coucher, comme d'habitude", async () => {
    const harness = build({
      startAt: at(23, 40),
      hours: {
        foxEndAt: endAt(0, 0, 15),
        foxEndWarningMarks: ["10"],
        foxBedtimePhrases: ["Je vais me coucher."],
      },
    });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await harness.run(55 * 60_000);
    expect(harness.synthesized).toEqual(["Je vais me coucher."]);
    const since = harness.events.length;
    await harness.receive(message("1", "Bonjour à tous", { viewerId: "alice" }));
    await harness.run(8000);
    expect(harness.timeline(since).map(({ label: name }) => name)).toContain("presence:returning");
    expect(harness.synthesized.at(-1)).toBe("Bonjour à tous");
  });

  it("ne rejoue pas la fin quand le serveur démarre en plein dépassement", async () => {
    const harness = build({
      startAt: at(0, 15, 15),
      hours: {
        foxEndAt: endAt(0, 0, 15),
        foxEndPhrases: ["{fin}. Le live est fini."],
        foxOvertimePhrases: ["Il est {maintenant}."],
        foxBedtimePhrases: ["Je vais me coucher."],
      },
    });
    harness.updateBroadcast({ isLive: true, duration: 3 * 3_600_000 + 15 * 60_000 });
    await harness.run(4 * 60_000);
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(2 * 60_000);
    expect(harness.synthesized).toEqual(["Il est minuit 20."]);
  });

  it("bâille au repos, sans partir, 5 à 10 min après 23 h 30 sans fin prévue, quand il est là", async () => {
    const harness = build({
      startAt: at(23, 25),
      overrides: { foxAwayAfter: 3_600_000 },
      hours: { foxLateAfter: "23:30" },
    });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await harness.run(25 * 60_000);
    const timeline = harness.timeline();
    const yawns = timeline.filter(({ label: name }) => name === "mode:yawn");
    expect(yawns.length).toBeGreaterThanOrEqual(2);
    expect(yawns.length).toBeLessThanOrEqual(4);
    // 23 h 30 est à 5 min du départ : le premier bâillement tombe entre 23 h 35 et 23 h 40.
    expect(yawns[0]?.at).toBeGreaterThanOrEqual(10 * 60_000);
    expect(yawns[0]?.at).toBeLessThanOrEqual(15 * 60_000);
    for (const { at: when } of yawns) {
      expect(
        timeline.find(({ at: next, label: name }) => next === when + 2000 && name !== "mode:yawn"),
      ).toBeDefined();
    }
    for (let index = 1; index < yawns.length; index += 1) {
      const gap = (yawns[index]?.at ?? 0) - (yawns[index - 1]?.at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(300_000);
      expect(gap).toBeLessThanOrEqual(600_000 + 100);
    }
    const names = timeline.map(({ label: name }) => name);
    expect(names).not.toContain("presence:leaving");
    expect(harness.speeches()).toHaveLength(0);
  });

  it("ne bâille pas avant l'heure, ni hors diffusion", async () => {
    const harness = build({
      startAt: at(22),
      overrides: { foxAwayAfter: 14_400_000 },
      hours: { foxLateAfter: "23:30" },
    });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await harness.run(80 * 60_000);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:yawn");
    harness.updateBroadcast({ isLive: false, duration: 0 });
    await harness.run(60 * 60_000);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:yawn");
  });

  it("ne revient pas pour un bâillement : parti, il reste caché", async () => {
    const harness = build({ startAt: at(23, 25), hours: { foxLateAfter: "23:30" } });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await harness.run(AWAY_AT + 5000);
    const since = harness.events.length;
    await harness.run(30 * 60_000);
    expect(harness.timeline(since)).toEqual([]);
  });
});

const REMINDER = "Venez dessiner sur LivePlace !";

describe("O : les rappels dans les silences", () => {
  it("dit un rappel au silence qui suit la pique, tourné vers le tchat, le renard étant revenu en sautant", async () => {
    const harness = build({ isHeard: true, jabs: ["Pique A"], reminders: [REMINDER], seconds: 2 });
    await harness.run(JAB_AT + 10_000);
    expect(harness.synthesized).toEqual(["Pique A"]);
    const since = harness.events.length;
    await harness.run(600_000);
    expect(harness.synthesized).toEqual(["Pique A", REMINDER]);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names).toContain("presence:returning");
    expect(names).not.toContain("mode:address");
    expect(toScaleAt(harness, harness.sim.now - harness.start)).toBe(1);
    expect(harness.logs.filter((line) => line.startsWith("Renard : il revient faire un rappel"))).toEqual([
      `Renard : il revient faire un rappel au tchat : « ${REMINDER} »`,
    ]);
  });

  it("repique ensuite, puis rappelle, à tour de rôle, toutes les 10 min", async () => {
    const harness = build({ isHeard: true, jabs: ["Pique A", "Pique B"], reminders: [REMINDER], seconds: 1 });
    await harness.run(JAB_AT + 3 * 600_000 + 10_000);
    const [first, second, third, fourth] = harness.synthesized;
    expect([second, fourth]).toEqual([REMINDER, REMINDER]);
    expect(new Set([first, third])).toEqual(new Set(["Pique A", "Pique B"]));
  });

  it("s'arrête quand Fenysk parle plus d'1 s, comme une pique, et ne reprend pas", async () => {
    const harness = build({ isHeard: true, jabs: [], reminders: [REMINDER], seconds: 6 });
    await harness.run(JAB_AT + 1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await harness.talk(2000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toHaveLength(1);
    await harness.run(60_000);
    expect(harness.speeches()).toHaveLength(1);
  });

  it("dit le prochain live d'Alexis, avec son jour, son heure et son titre, quand il n'y a que lui", async () => {
    const harness = build({
      startAt: new Date(2026, 9, 14, 21, 0).getTime(),
      isHeard: true,
      jabs: [],
      reminders: [],
      slot: { start: new Date(2026, 9, 16, 20, 0).getTime(), title: "Soirée jeux" },
    });
    await harness.run(JAB_AT + 5000);
    expect(harness.synthesized).toEqual([
      "Prochain live : vendredi à 20 heures. Au programme : Soirée jeux.",
    ]);
  });

  it("mêle le prochain live aux rappels de la liste, sans répéter avant d'avoir tout dit", async () => {
    const harness = build({
      startAt: new Date(2026, 9, 14, 21, 0).getTime(),
      isHeard: true,
      jabs: [],
      reminders: [REMINDER],
      slot: { start: new Date(2026, 9, 17, 20, 30).getTime(), title: null },
    });
    await harness.run(JAB_AT + 600_000 + 5000);
    expect(new Set(harness.synthesized)).toEqual(
      new Set([REMINDER, "Prochain live : samedi à 20 heures 30."]),
    );
  });

  it("garde la pique seule, comme avant, sans aucun rappel ni aucun live à venir", async () => {
    const harness = build({ isHeard: true, jabs: ["Pique A", "Pique B"], reminders: [], seconds: 1 });
    await harness.run(JAB_AT + 600_000 + 5000);
    expect([...harness.synthesized].sort()).toEqual(["Pique A", "Pique B"]);
  });
});

describe("P : il remercie les lurks", () => {
  const lurk = (id: string, overrides: Partial<RawMessage> = {}, text = "!lurk"): RawMessage =>
    message(id, text, { nickname: "Alice", viewerId: "alice", isCommand: true, ...overrides });

  it("remercie un !lurk comme un follow : 1 s de sourire, puis la phrase, sans lire la commande", async () => {
    const harness = build();
    await harness.run(10_000);
    const since = harness.events.length;
    const at = harness.sim.now - harness.start;
    await harness.receive(lurk("1"));
    await harness.run(5000);
    expect(harness.timeline(since).slice(0, 3)).toEqual([
      { at, label: "mode:reaction:front-smile-rest" },
      { at: at + 1000, label: "mode:idle" },
      { at: at + 1000, label: "speech" },
    ]);
    expect(harness.synthesized).toEqual(["Merci Alice pour le lurk."]);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:address");
  });

  it("reconnaît !LURK avec un texte derrière, et ne remercie le viewer qu'une fois", async () => {
    const harness = build();
    await harness.receive(lurk("1", {}, "!LURK à plus tard"));
    await harness.run(5000);
    await harness.receive(lurk("2", {}, "!lurk"));
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le lurk."]);
    await harness.receive(lurk("3", { viewerId: "bob", nickname: "Bob" }));
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Merci Alice pour le lurk.", "Merci Bob pour le lurk."]);
  });

  it("revient en sautant s'il était parti, sourit, puis remercie", async () => {
    const harness = build();
    await harness.run(AWAY_AT + 6000);
    const since = harness.events.length;
    await harness.receive(lurk("1"));
    await harness.run(5000);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names.slice(0, 2)).toEqual(["presence:returning", "mode:reaction:front-smile-rest"]);
    expect(harness.synthesized).toEqual(["Merci Alice pour le lurk."]);
  });

  it("passe devant un message du tchat qui attendait", async () => {
    const harness = build();
    await harness.wave("carol");
    const before = harness.synthesized.length;
    await harness.talk(3000);
    await harness.receive(message("2", "Bonjour tout le monde", { viewerId: "carol" }));
    await harness.receive(lurk("3"));
    await harness.run(8000);
    expect(harness.synthesized.slice(before, before + 2)).toEqual([
      "Merci Alice pour le lurk.",
      "Bonjour tout le monde",
    ]);
  });

  it("attend le silence de Fenysk, et sa voix ne le coupe pas", async () => {
    const harness = build({ seconds: 4 });
    await harness.talk(2000);
    await harness.receive(lurk("1"));
    await harness.talk(2000);
    expect(harness.speeches()).toHaveLength(0);
    const lastLoud = harness.sim.now - 50;
    // 1 s de silence, puis 1 s de sourire, puis la phrase.
    await harness.run(1900);
    expect(harness.speeches()).toHaveLength(0);
    await harness.run(600);
    const speech = harness.speeches()[0];
    expect((speech?.at ?? 0) - lastLoud).toBeGreaterThanOrEqual(2000);
    const since = harness.events.length;
    await harness.talk(3000);
    expect(harness.events.slice(since).filter(({ event }) => event.kind === "stop")).toEqual([]);
  });

  it("ne dit pas un pseudo insultant : la phrase générique", async () => {
    const harness = build();
    await harness.receive(lurk("1", { nickname: "connard" }));
    await harness.run(5000);
    expect(harness.synthesized).toEqual(["Merci pour le lurk."]);
    const thanksLines = harness.logs.filter(
      (line) => line.includes("remerciement") || line.includes("dits par"),
    );
    expect(thanksLines.join("\n")).not.toContain("connard");
  });

  it("ne remercie rien, et ne réveille pas le renard parti, quand la case est décochée", async () => {
    const harness = build({ overrides: { foxShouldThank: false } });
    await harness.run(AWAY_AT + 6000);
    const since = harness.events.length;
    await harness.receive(lurk("1"));
    await harness.run(5000);
    expect(harness.timeline(since)).toEqual([]);
    expect(harness.synthesized).toEqual([]);
  });

  it("compte pour de l'activité : la relance attend 3 min de plus", async () => {
    const harness = build({ isHeard: true, jabs: JABS });
    await harness.run(300_000);
    await harness.receive(lurk("1"));
    await harness.run(JAB_AT + 100_000 - 300_000);
    expect(jabLines(harness)).toEqual([]);
  });
});

describe("S : il sursaute avec le jeu", () => {
  // Le jeu est calme, puis explose : -45 dB pendant 150 ms, puis -10 dB.
  const explode = async (harness: ReturnType<typeof build>) => {
    await harness.sound(150, { voice: null, game: -45 });
    await harness.sound(50, { voice: null, game: -10 });
  };

  it("prend la tête choquée pendant 1 s, tournée vers le tchat (sans miroir), sans rien dire", async () => {
    const harness = build();
    await harness.run(10_000);
    const since = harness.events.length;
    const at = harness.sim.now - harness.start + 150;
    await explode(harness);
    await harness.run(3000);
    expect(harness.timeline(since)).toEqual([
      { at, label: "mode:startle" },
      { at: at + 1000, label: "mode:idle" },
    ]);
    const images = harness.toImages(harness.start + at + 200, harness.start + at + 990);
    expect(new Set(images)).toEqual(new Set(["left-large-rest"]));
    expect(toScaleAt(harness, at + 400)).toBe(1);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("ne sursaute pas pour un son qui monte lentement, ni pour un son déjà fort", async () => {
    const harness = build();
    await harness.run(10_000);
    const since = harness.events.length;
    for (let step = 0; step < 15; step += 1) await harness.sound(50, { voice: null, game: -40 + 2 * step });
    await harness.sound(2000, { voice: null, game: -10 });
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:startle");
  });

  it("ne sursaute pas caché, et ne revient pas pour un pic du jeu", async () => {
    const harness = build();
    await harness.run(AWAY_AT + 5000);
    const since = harness.events.length;
    await explode(harness);
    await harness.run(3000);
    expect(harness.timeline(since)).toEqual([]);
  });

  it("ne sursaute pas pendant qu'il parle ou qu'une phrase l'attend", async () => {
    const harness = build({ seconds: 4 });
    await harness.receive(message("1", "Salut tout le monde", { viewerId: "alice" }));
    await harness.run(1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await explode(harness);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:startle");
  });

  it("sursaute au plus toutes les 30 s", async () => {
    const harness = build({ overrides: { foxAwayAfter: 3_600_000 } });
    await harness.run(10_000);
    const since = harness.events.length;
    await explode(harness);
    await harness.run(10_000);
    await explode(harness);
    await harness.run(30_000);
    await explode(harness);
    await harness.run(3000);
    const startles = harness.timeline(since).filter(({ label: name }) => name === "mode:startle");
    expect(startles).toHaveLength(2);
    expect((startles[1]?.at ?? 0) - (startles[0]?.at ?? 0)).toBeGreaterThanOrEqual(30_000);
  });

  it("n'écrase pas le retournement vers Fenysk d'une phrase", async () => {
    const harness = build({ isHeard: true, jabs: JABS, seconds: 4 });
    await harness.run(JAB_AT + 1500);
    expect(harness.speeches()).toHaveLength(1);
    const since = harness.events.length;
    await explode(harness);
    expect(harness.timeline(since).map(({ label: name }) => name)).not.toContain("mode:startle");
  });
});

describe("U : il remercie un viewer très impliqué", () => {
  const alice = (id: string, text: string): RawMessage =>
    message(id, text, { viewerId: "alice", nickname: "Alice" });

  it("remercie le viewer qui atteint le seuil devant son message, une seule fois", async () => {
    const harness = build({ overrides: { foxTalkativeMessages: 2 } });
    await harness.receive(alice("1", "Premier"));
    await harness.run(15_000);
    await harness.receive(alice("2", "Second"));
    await harness.run(15_000);
    await harness.receive(alice("3", "Troisième"));
    await harness.run(15_000);
    expect(harness.synthesized).toEqual(["Premier", "Alice a écrit 2 messages.", "Second", "Troisième"]);
  });

  it("ne compte pas les messages que le filtre ignore", async () => {
    const harness = build({ overrides: { foxTalkativeMessages: 2 } });
    await harness.receive(alice("1", "Premier"));
    await harness.run(15_000);
    await harness.receive(alice("2", "https://exemple.fr"));
    await harness.run(15_000);
    expect(harness.synthesized).toEqual(["Premier"]);
  });
});

describe("V : le bilan du live", () => {
  const END = {
    foxEndAt: endAt(0, 0, 15),
    foxEndWarningMarks: ["10"],
    foxEndWarningPhrases: [],
    foxEndSoonPhrases: [],
    foxEndPanicPhrases: [],
    foxEndPhrases: ["{fin}. Le live est fini."],
    foxOvertimePhrases: [],
    foxBedtimePhrases: [],
  };
  const REVIEW_TEXT =
    "Ce live : 3 messages, de 2 personnes. Le plus bavard : Alice, avec 2 messages. Premier arrivé : Alice.";
  const writeAll = async (harness: ReturnType<typeof build>) => {
    await harness.receive(message("1", "Premier", { viewerId: "alice", nickname: "Alice" }));
    await harness.run(15_000);
    await harness.receive(message("2", "Salut", { viewerId: "bob", nickname: "Bob" }));
    await harness.run(15_000);
    await harness.receive(message("3", "Second", { viewerId: "alice", nickname: "Alice" }));
    await harness.run(15_000);
  };

  it("le dit juste après l'annonce de la fin prévue, tourné vers le tchat, une seule fois", async () => {
    const harness = build({ startAt: at(23, 40), hours: END, overrides: { foxShouldReviewAtEnd: true } });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await writeAll(harness);
    const since = harness.synthesized.length;
    await harness.run(20 * 60_000);
    expect(harness.synthesized.slice(since).slice(0, 2)).toEqual(["Minuit. Le live est fini.", REVIEW_TEXT]);
    expect(harness.synthesized.filter((text) => text === REVIEW_TEXT)).toHaveLength(1);
  });

  it("ne le dit pas à la fin prévue quand la case est décochée", async () => {
    const harness = build({ startAt: at(23, 40), hours: END, overrides: { foxShouldReviewAtEnd: false } });
    harness.updateBroadcast({ isLive: true, duration: 0 });
    await writeAll(harness);
    await harness.run(20 * 60_000);
    expect(harness.synthesized).not.toContain(REVIEW_TEXT);
  });
});

describe("Q : les emotes changent sa tête", () => {
  const withEmotes = {
    overrides: {
      foxEmoteReactions: ["LUL = sourire", "WutFace = choc"],
      foxEmoteNames: ["LUL", "WutFace"],
    },
  };

  it("un message qui contient une emote de la liste montre sa réaction 1 s, puis la lecture commence", async () => {
    const harness = build(withEmotes);
    await harness.wave("alice");
    const since = harness.events.length;
    const from = harness.sim.now;
    await harness.receive(message("2", "trop drôle LUL", { viewerId: "alice" }));
    await harness.run(3000);
    expect(
      harness.timeline(since).map((entry) => ({ ...entry, at: entry.at - (from - harness.start) })),
    ).toEqual([
      { at: 0, label: "mode:reaction:front-smile-rest" },
      { at: 1000, label: "mode:idle" },
      { at: 1000, label: "speech" },
    ]);
    expect(harness.synthesized.at(-1)).toBe("trop drôle");
  });

  it("un message d'emotes seules montre sa réaction 1 s, sans rien lire", async () => {
    const harness = build(withEmotes);
    await harness.run(10_000);
    const since = harness.events.length;
    const at = harness.sim.now - harness.start;
    await harness.receive(message("1", "WutFace WutFace", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since)).toEqual([
      { at, label: "mode:reaction:left-large-rest" },
      { at: at + 1000, label: "mode:idle" },
    ]);
    expect(harness.synthesized).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("ne le fait pas revenir quand il est caché", async () => {
    const harness = build(withEmotes);
    await harness.run(AWAY_AT + 6000);
    const since = harness.events.length;
    await harness.receive(message("1", "LUL", { viewerId: "alice" }));
    await harness.run(3000);
    expect(harness.timeline(since)).toEqual([]);
  });

  it("n'en montre qu'une toutes les 5 s", async () => {
    const harness = build(withEmotes);
    await harness.run(10_000);
    const since = harness.events.length;
    await harness.receive(message("1", "LUL", { viewerId: "alice" }));
    await harness.run(2000);
    await harness.receive(message("2", "LUL", { viewerId: "bob" }));
    await harness.run(3000);
    await harness.receive(message("3", "WutFace", { viewerId: "carole" }));
    await harness.run(2000);
    expect(
      harness
        .timeline(since)
        .map(({ label: name }) => name)
        .filter((name) => name.startsWith("mode:reaction")),
    ).toEqual(["mode:reaction:front-smile-rest", "mode:reaction:left-large-rest"]);
  });
});

describe("R : son humeur suit le tchat", () => {
  const MINUTE = 60_000;
  const attitudes = (harness: ReturnType<typeof build>, since = 0) =>
    harness.events.slice(since).flatMap(({ event }) => (event.kind === "attitude" ? [event.attitude] : []));
  const alice = (id: string, text = "Bonjour") => message(id, text, { viewerId: "alice", nickname: "Alice" });
  const RESUME = { foxResumeAfter: 5 * MINUTE, foxResumePhrases: ["Ah, maintenant vous parlez ?"] };

  it("boude quand le tchat se tait depuis 90 s, visible, et redevient ordinaire au premier message", async () => {
    const harness = build({ overrides: { foxSulkAfter: 90_000 } });
    await harness.run(89_000);
    expect(attitudes(harness)).toEqual([]);
    await harness.run(2000);
    expect(attitudes(harness)).toEqual(["sulking"]);
    await harness.receive(alice("1"));
    expect(attitudes(harness)).toEqual(["sulking", "plain"]);
  });

  it("ne boude plus dès qu'il est parti : l'humeur ne se voit pas, il ne revient pas pour elle", async () => {
    const harness = build({ overrides: { foxSulkAfter: 90_000 } });
    await harness.run(AWAY_AT + 3000);
    expect(attitudes(harness)).toEqual(["sulking", "plain"]);
    const since = harness.events.length;
    await harness.run(5 * MINUTE);
    expect(harness.timeline(since)).toEqual([]);
  });

  it("est joyeux au nombre de messages acceptés réglé, dans la période", async () => {
    const harness = build({ overrides: { foxCheerfulCount: 5 } });
    for (let index = 0; index < 5; index += 1) {
      await harness.receive(message(`m${index}`, `Message ${index}`, { viewerId: `viewer-${index}` }));
      await harness.run(5000);
    }
    expect(attitudes(harness)).toEqual(["cheerful"]);
  });

  it("dit la reprise avant le premier message qui suit le silence, d'une seule traite", async () => {
    const harness = build({
      overrides: { foxResumeAfter: 60_000, foxResumePhrases: RESUME.foxResumePhrases },
    });
    await harness.run(61_000);
    await harness.receive(alice("1", "Bonjour"));
    await harness.run(20_000);
    expect(harness.synthesized).toEqual(["Ah, maintenant vous parlez ? Bonjour"]);
    expect(harness.timeline().map(({ label: name }) => name)).not.toContain("mode:address");
  });

  it("revient en sautant s'il était parti, puis dit la reprise avant de lire", async () => {
    const harness = build({ overrides: RESUME });
    await harness.run(5 * MINUTE);
    const since = harness.events.length;
    await harness.receive(alice("1", "Bonjour"));
    await harness.run(20_000);
    const names = harness.timeline(since).map(({ label: name }) => name);
    expect(names.indexOf("presence:returning")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("presence:returning")).toBeLessThan(names.indexOf("speech"));
    expect(harness.synthesized).toEqual(["Ah, maintenant vous parlez ? Bonjour"]);
  });

  it("ne la dit pas deux fois en 30 min", async () => {
    const harness = build({ overrides: RESUME });
    await harness.run(6 * MINUTE);
    await harness.receive(alice("1", "Premier"));
    await harness.run(15_000);
    await harness.run(6 * MINUTE);
    await harness.receive(alice("2", "Second"));
    await harness.run(15_000);
    expect(harness.synthesized).toEqual(["Ah, maintenant vous parlez ? Premier", "Second"]);
  });
});
