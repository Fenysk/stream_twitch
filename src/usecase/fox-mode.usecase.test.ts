import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import { FOX_START, toFoxDisplay, toFoxRules, toNextFox } from "../domain/fox.rules";
import type { FoxEvent, FoxMode } from "../domain/fox.schema";
import { IDLE_MODE } from "../domain/fox-mode.rules";
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
import type { Voice } from "../domain/voice.schema";
import type { ChatSourceEvent } from "./chat.usecase";
import { createFox, type VoicePort } from "./fox.usecase";
import { createFoxChat } from "./fox-chat.usecase";
import { createFoxJab } from "./fox-jab.usecase";
import { createFoxMode } from "./fox-mode.usecase";
import { createFoxQueue } from "./fox-queue.usecase";
import { createFoxThanks } from "./fox-thanks.usecase";

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
  foxJabAfter: 180_000,
  foxJabGap: 600_000,
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
  options: { seconds?: number; jabs?: string[]; viewers?: number | null; overrides?: Partial<Settings> } = {},
) => {
  // Les réglages de ce serveur : les piques sont celles du test, aucune par défaut (le renard ne revient pas de lui-même).
  // Un remerciement par liste : la phrase est connue d'avance.
  const serverSettings: Settings = {
    ...settings,
    foxJabs: options.jabs ?? [],
    foxPronunciations: ["gg = gé gé", "wtf = what the fuck", "fenysk = Fénisque"],
    foxShouldThank: true,
    foxThankGap: 10_000,
    foxThanksFollow: ["Merci {user} pour le follow."],
    foxThanksFollowGeneric: ["Merci aux nouveaux followers."],
    foxThanksSub: ["Merci {user} pour le sub."],
    foxThanksGiftOne: ["{user} offre un sub à {recipient}."],
    foxThanksGiftMany: ["{user} offre {count} subs."],
    foxThanksCheer: ["Merci {user} pour {bits} bits."],
    ...options.overrides,
  };
  const sim = { now: 1_000_000, order: 0, ids: 0 };
  const start = sim.now;
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
  let micListener: (level: number) => void = () => undefined;
  const mode = createFoxMode({
    mic: {
      subscribe(listener) {
        micListener = listener;
        return () => {
          micListener = () => undefined;
        };
      },
    },
    fox,
    settings: serverSettings,
    clock: () => sim.now,
    schedule,
    log: (line) => logs.push(line),
  });
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
  const foxChat = createFoxChat({
    chat,
    queue,
    emotes: { getNames: () => [] },
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
    settings: serverSettings,
    clock: () => sim.now,
    random: seeded(11),
    log: (line) => logs.push(line),
  });
  const thanks = createFoxThanks({
    chat,
    queue,
    foxChat,
    viewers: { getCount: () => options.viewers ?? null },
    jab,
    settings: serverSettings,
    insults,
    clock: () => sim.now,
    schedule,
    random: seeded(5),
    log: (line) => logs.push(line),
  });
  mode.start();
  queue.start();
  foxChat.start();
  jab.start();
  thanks.start();
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
  const talk = async (ms: number) => {
    for (let spent = 0; spent < ms; spent += 50) {
      micListener(-15);
      await run(50);
    }
  };
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
    run,
    talk,
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
    await harness.receive(message("1", "!lurk", { viewerId: "alice", isCommand: true }));
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
    await harness.receive(message("1", "!lurk", { isCommand: true }));
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

  it("est visible et repart de zéro quand une page /fox se connecte", async () => {
    const harness = build();
    await harness.run(AWAY_AT);
    const since = harness.events.length;
    harness.mode.reset();
    expect(harness.timeline(since).map(({ label: name }) => name)).toEqual(["presence:visible"]);
    const resetAt = harness.sim.now;
    await harness.run(179_900);
    expect(harness.timeline(since).some(({ label: name }) => name === "mode:yawn")).toBe(false);
    await harness.run(200);
    const yawn = harness.timeline(since).find(({ label: name }) => name === "mode:yawn");
    expect((yawn?.at ?? 0) + harness.start - resetAt).toBe(180_000);
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
    if (event.kind === "mode" && time <= at)
      mirror = toNextMirror(mirror, event.mode.kind === "address", time);
  }
  return toMirrorScale(mirror, at);
};

const JABS = ["Pique A", "Pique B", "Pique C"];
// 3 min sans parler, le bâillement (2 s) et le départ (1,5 s) : il est parti depuis 183,5 s, la pique est due 3 min plus tard.
const JAB_AT = 363_500;

const jabLines = (harness: ReturnType<typeof build>): string[] =>
  harness.logs.filter((line) => line.startsWith("Renard : il revient piquer Fenysk"));

describe("La relance : caché, il revient piquer Fenysk après 3 min de silence total", () => {
  it("ne revient pas tant que le silence ne dure pas 3 min depuis son départ, puis revient en sautant à la seconde près", async () => {
    const harness = build({ jabs: JABS });
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

  it("revient en sautant, se tourne vers Fenysk (150 ms), dit la pique, puis se retourne", async () => {
    const harness = build({ jabs: JABS, seconds: 2 });
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
    const harness = build({ jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 3000);
    const images = harness.toImages(harness.start + JAB_AT + 820, harness.start + JAB_AT + 940);
    expect(new Set(images)).toEqual(new Set(["left-closed-rest"]));
  });

  it("dit une pique de la liste", async () => {
    const harness = build({ jabs: JABS });
    await harness.run(JAB_AT + 1000);
    expect(JABS.some((jab) => jabLines(harness)[0]?.includes(`« ${jab} »`))).toBe(true);
  });

  it("ne repique pas avant 10 min, puis repique à la dixième minute si le silence dure", async () => {
    const harness = build({ jabs: JABS });
    await harness.run(JAB_AT + 599_900);
    expect(jabLines(harness)).toHaveLength(1);
    expect(harness.speeches()).toHaveLength(1);
    await harness.run(100);
    expect(jabLines(harness)).toHaveLength(2);
    await harness.run(5000);
    expect(harness.speeches()).toHaveLength(2);
  });

  it("dit chaque pique avant d'en redire une", async () => {
    const harness = build({ jabs: JABS });
    await harness.run(JAB_AT + 2 * 600_000 + 5000);
    const lines = jabLines(harness);
    expect(lines).toHaveLength(3);
    for (const jab of JABS) expect(lines.filter((line) => line.includes(`« ${jab} »`))).toHaveLength(1);
  });

  it("repart ensuite comme d'habitude : il repart 3 min après la fin de sa pique", async () => {
    const harness = build({ jabs: JABS, seconds: 2 });
    await harness.run(JAB_AT + 950 + 2400 + 180_000 + 10_000);
    const names = harness.timeline().filter(({ at }) => at > JAB_AT + 3400);
    // La phrase finit à JAB_AT + 3350 + 400 ; le bâillement arrive au pas de 100 ms qui suit les 3 min.
    expect(names.find(({ label: name }) => name === "mode:yawn")?.at).toBe(
      JAB_AT + 950 + 2400 + 180_000 + 50,
    );
    expect(names.some(({ label: name }) => name === "presence:away")).toBe(true);
  });

  it("attend 3 min de plus quand le tchat dit quelque chose, même un message que le filtre ignore", async () => {
    const harness = build({ jabs: JABS });
    await harness.run(300_000);
    await harness.receive(message("1", "!lurk", { isCommand: true }));
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
    const harness = build({ jabs: JABS, seconds: 6 });
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
    const harness = build({ jabs: [] });
    await harness.run(JAB_AT * 3);
    expect(jabLines(harness)).toEqual([]);
    expect(harness.speeches()).toHaveLength(0);
  });

  it("n'interrompt pas un message du tchat : la pique passe par la même file, un message qui arrive pendant le retour passe après", async () => {
    const harness = build({ jabs: JABS, seconds: 2 });
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
    const harness = build({ jabs: ["Pourquoi Fenysk ne parle plus ?"] });
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
