import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import type { Show } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { Voice } from "../domain/voice.schema";
import { type ChatSource, type ChatSourceEvent, createChat } from "./chat.usecase";
import { createFox, type SpeakPlan, type SpeakResult, type VoicePort } from "./fox.usecase";
import { createFoxChat } from "./fox-chat.usecase";
import type { FoxModeController, Intro, VoiceView } from "./fox-mode.usecase";
import { createFoxQueue } from "./fox-queue.usecase";

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

type Spoken = {
  text: string;
  isCancelled: () => boolean;
  settle: (result: SpeakResult) => void;
  waitFor: Promise<void> | undefined;
};

// Le renard vu du lecteur : la voix d'Alexis se règle à la main (au départ il se tait depuis toujours), les entrées en
// scène et les réveils se notent, et un pas de 100 ms se déclenche à la main.
type StubIntro = { show: Show | null; isCancelled: boolean; release: () => void };

const createStubMode = () => {
  const voice: VoiceView = { isTalking: false, talkingFor: 0, silentFor: Number.POSITIVE_INFINITY };
  const calls = { wakes: 0, spokes: 0, intros: [] as StubIntro[] };
  const state = { shouldHold: false, tick: (): void => undefined, subscribers: 0 };
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
      let release: () => void = () => undefined;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      const intro: StubIntro = { show, isCancelled: false, release };
      calls.intros.push(intro);
      if (!state.shouldHold) release();
      return {
        ready,
        cancel() {
          intro.isCancelled = true;
          release();
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
  return {
    mode,
    voice,
    calls,
    holdIntros: () => {
      state.shouldHold = true;
    },
    tick: () => state.tick(),
    subscribers: () => state.subscribers,
  };
};

// Une horloge et un programmateur à la main : le temps n'avance que quand le test le dit.
const setup = (custom: Settings = settings) => {
  const stub = createStubMode();
  // Les noms d'emotes de 7TV, BTTV et FFZ que la synchro a reçus ; un test y ajoute les siens.
  const syncedNames: string[] = [];
  // T : la phrase d'accueil que le fichier des habitués rend (`welcome`), et les messages qu'il a reçus.
  const state = {
    now: 100_000,
    welcome: null as string | null,
    // R : la phrase de la reprise que l'humeur rend (`resume`), et les messages du tchat qu'elle a reçus.
    resume: null as string | null,
    flashMs: 1000,
  };
  const notes: { isAccepted: boolean }[] = [];
  // Q : ce que le renard montre de lui-même pour un message d'emotes seules.
  const flashes: Show[] = [];
  const visits: { raw: RawMessage; canWelcome: boolean }[] = [];
  // U : les messages que le compte a reçus.
  const counted: RawMessage[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const messages: string[] = [];
  const spoken: Spoken[] = [];
  const stops = { count: 0 };
  let emit: (event: ChatSourceEvent) => void = () => undefined;
  let subscribers = 0;
  const chat = {
    subscribeSource(listener: (event: ChatSourceEvent) => void) {
      subscribers += 1;
      emit = listener;
      return () => {
        subscribers -= 1;
        emit = () => undefined;
      };
    },
  };
  const fox = {
    speak(text: string, options?: SpeakPlan) {
      return new Promise<SpeakResult>((resolve) => {
        spoken.push({
          text,
          isCancelled: options?.isCancelled ?? (() => false),
          settle: resolve,
          waitFor: options?.waitFor,
        });
      });
    },
    stop() {
      stops.count += 1;
    },
  };
  const queue = createFoxQueue({
    fox,
    mode: stub.mode,
    settings: custom,
    clock: () => state.now,
    schedule: (callback, ms) => {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => messages.push(line),
  });
  const reader = createFoxChat({
    chat,
    queue,
    mode: {
      flash(show) {
        flashes.push(show);
        return state.flashMs;
      },
    },
    emotes: { getNames: () => syncedNames },
    regulars: {
      noteMessage(raw, { canWelcome }) {
        visits.push({ raw, canWelcome });
        return state.welcome;
      },
    },
    tally: { noteMessage: (raw) => counted.push(raw) },
    attitude: {
      noteMessage(note) {
        notes.push(note);
        return note.isAccepted ? state.resume : null;
      },
    },
    settings: custom,
    insults,
    clock: () => state.now,
    log: (line) => messages.push(line),
  });
  // Le serveur câble les deux : un réglage change dans la file et dans le lecteur, l'arrêt vide la file.
  const foxChat = {
    start: () => reader.start(),
    stop() {
      reader.stop();
      queue.stop();
    },
    update(next: Settings) {
      queue.update(next);
      reader.update(next);
    },
    speakAttached: (raw: RawMessage) => reader.speakAttached(raw),
  };
  queue.start();
  foxChat.start();
  const send = (event: ChatSourceEvent) => emit(event);
  const flush = async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  };
  // La synthèse du n-ième texte finit : la phrase part aux pages, et dure `durationMs`.
  const finishSynthesis = async (index: number, durationMs = 2000) => {
    const item = spoken[index];
    if (!item) throw new Error(`aucune phrase n°${index}`);
    item.settle({ ok: true, url: `/api/fox/speech/${index}`, durationMs });
    await flush();
  };
  const advance = async (ms: number) => {
    state.now += ms;
    for (const timer of [...timers].filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
    await flush();
  };
  return {
    foxChat,
    state,
    spoken,
    stops,
    messages,
    stub,
    syncedNames,
    visits,
    counted,
    notes,
    flashes,
    subscribers: () => subscribers,
    pendingTimers: () => timers.filter(({ isCancelled }) => !isCancelled).length,
    receive: async (raw: RawMessage) => {
      send({ kind: "message", message: raw });
      await flush();
    },
    deleteMessage: async (messageId: string) => {
      send({ kind: "message-deleted", messageId });
      await flush();
    },
    deleteViewer: async (viewerId: string) => {
      send({ kind: "viewer-messages-deleted", viewerId });
      await flush();
    },
    finishSynthesis,
    advance,
    flush,
  };
};

describe("createFoxChat : un message ordinaire", () => {
  it("lit le texte seul, sans le pseudo, dès que le message arrive", async () => {
    const { receive, spoken } = setup();
    await receive(message("1", "Bonjour tout le monde !"));
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour tout le monde !"]);
  });

  it("ne lit pas les emotes : celles de Twitch (positions) et celles de la liste", async () => {
    const { receive, spoken } = setup();
    await receive(message("1", "Bien Kappa joué KEKW", { emotes: [{ id: "25", start: 5, end: 9 }] }));
    expect(spoken.map(({ text }) => text)).toEqual(["Bien joué"]);
  });

  it("ne lit pas non plus les emotes synchronisées de 7TV, BTTV et FFZ, et garde celles de la liste à la main", async () => {
    const { receive, spoken, syncedNames } = setup();
    syncedNames.push("EZ", "monkaS", "ZreknarF");
    await receive(message("1", "EZ bien joué KEKW monkaS ZreknarF vraiment", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["bien joué vraiment"]);
  });

  it("ignore un message fait seulement d'emotes synchronisées, et le dit", async () => {
    const { receive, spoken, messages, syncedNames } = setup();
    syncedNames.push("EZ", "Clap");
    await receive(message("1", "EZ Clap"));
    expect(spoken).toEqual([]);
    expect(messages[0]).toContain("il ne reste que des emotes");
  });

  it("applique une emote arrivée à la synchro suivante, sans redémarrer", async () => {
    const { receive, spoken, syncedNames, finishSynthesis, advance } = setup();
    await receive(message("1", "Nouvelle bravo", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Nouvelle bravo"]);
    await finishSynthesis(0, 500);
    await advance(900);
    syncedNames.push("Nouvelle");
    await receive(message("2", "Nouvelle bravo", { viewerId: "bob" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Nouvelle bravo", "bravo"]);
  });

  it("lit les messages l'un après l'autre : le suivant part à la fin du précédent, plus 400 ms de silence", async () => {
    const { receive, spoken, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    expect(spoken.map(({ text }) => text)).toEqual(["Premier"]);
    await finishSynthesis(0, 2000);
    await advance(2399);
    expect(spoken).toHaveLength(1);
    await advance(1);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });

  it("garde l'ordre d'arrivée", async () => {
    const { receive, spoken, finishSynthesis, advance } = setup();
    for (const id of ["1", "2", "3"]) await receive(message(id, `Message ${id}`));
    await finishSynthesis(0, 1000);
    await advance(1400);
    await finishSynthesis(1, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Message 1", "Message 2", "Message 3"]);
  });
});

describe("createFoxChat : les mentions", () => {
  it("lit « @Benitoad t'as vu ça ? » en « Benitoad, t'as vu ça ? » et « merci @Benitoad » en « merci Benitoad »", async () => {
    const { receive, spoken, finishSynthesis, advance } = setup();
    await receive(message("1", "@Benitoad t'as vu ça ?"));
    await finishSynthesis(0, 500);
    await advance(900);
    await receive(message("2", "merci @Benitoad", { viewerId: "bob" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Benitoad, t'as vu ça ?", "merci Benitoad"]);
  });

  it("retire un nickname insultant de la phrase lue, ou ignore le message quand il n'en reste rien", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "@connard salut", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["salut"]);
    await receive(message("2", "@connard", { viewerId: "bob" }));
    expect(spoken).toHaveLength(1);
    expect(messages.at(-1)).toContain("insulte : « connard »");
  });
});

describe("createFoxChat : les majuscules", () => {
  it("lit un message court en majuscules (« GG », « JEANRENARD ») et ignore un long, en le disant", async () => {
    const { receive, spoken, messages, finishSynthesis, advance } = setup();
    await receive(message("1", "JEANRENARD"));
    await finishSynthesis(0, 500);
    await advance(900);
    await receive(message("2", "GG", { viewerId: "bob" }));
    expect(spoken.map(({ text }) => text)).toEqual(["JEANRENARD", "GG"]);
    await receive(message("3", "SALUT TOUT LE MONDE", { viewerId: "carol" }));
    expect(spoken).toHaveLength(2);
    expect(messages.at(-1)).toContain("spam : majuscules");
  });

  it("suit le maximum réglé dans l'onglet Renard, sans redémarrer", async () => {
    const { foxChat, receive, spoken } = setup();
    foxChat.update({ ...settings, foxCapitalsMaxLength: 5 });
    await receive(message("1", "JEANRENARD"));
    expect(spoken).toEqual([]);
    foxChat.update({ ...settings, foxCapitalsMaxLength: 10 });
    await receive(message("2", "JEANRENARD", { viewerId: "bob" }));
    expect(spoken.map(({ text }) => text)).toEqual(["JEANRENARD"]);
  });
});

describe("createFoxChat : un message qui attend plus de 2 min n'est plus lu", () => {
  const withMaxWait: Settings = { ...settings, foxReadMaxWait: 120_000 };
  const speaking = { isTalking: true, talkingFor: 5000, silentFor: 0 };
  const quiet = { isTalking: false, talkingFor: 0, silentFor: 5000 };

  it("retire le message qui attendait depuis 2 min 1 s, avec sa ligne dans le journal, et ne le lit pas", async () => {
    const { receive, spoken, messages, stub, advance, flush } = setup(withMaxWait);
    Object.assign(stub.voice, speaking);
    await receive(message("1", "Bonjour", { nickname: "Alice" }));
    await advance(120_000);
    stub.tick();
    await flush();
    expect(messages).toEqual([]);
    await advance(1000);
    stub.tick();
    await flush();
    expect(messages).toEqual(["Renard : message de Alice expiré (attente de plus de 2 min)"]);
    Object.assign(stub.voice, quiet);
    stub.tick();
    await flush();
    expect(spoken).toEqual([]);
  });

  it("lit un message qui a attendu moins de 2 min quand Alexis se tait", async () => {
    const { receive, spoken, stub, advance, flush } = setup(withMaxWait);
    Object.assign(stub.voice, speaking);
    await receive(message("1", "Bonjour"));
    await advance(119_000);
    Object.assign(stub.voice, quiet);
    stub.tick();
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour"]);
  });

  it("dit quand même le message joint à un sub ou à des bits, après 5 min d'attente", async () => {
    const { foxChat, spoken, messages, stub, advance, flush } = setup(withMaxWait);
    Object.assign(stub.voice, speaking);
    foxChat.speakAttached(message("1", "Bravo pour le stream"));
    await advance(300_000);
    stub.tick();
    await flush();
    expect(messages).toEqual([]);
    Object.assign(stub.voice, quiet);
    stub.tick();
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Bravo pour le stream"]);
  });
});

describe("createFoxChat : ce que le filtre ignore, et la ligne du journal", () => {
  it("ignore une commande (!lurk), et le dit avec sa raison et le texte", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "!lurk", { isCommand: true, nickname: "Alice" }));
    expect(spoken).toEqual([]);
    expect(messages).toEqual(["Renard : message de Alice ignoré (commande) : « !lurk »"]);
  });

  it("ignore un bot connu", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "Pensez à suivre", { viewerLogin: "Nightbot", nickname: "Nightbot" }));
    expect(spoken).toEqual([]);
    expect(messages[0]).toContain("(bot connu)");
  });

  it("ignore un lien", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "va voir https://exemple.com/promo"));
    expect(spoken).toEqual([]);
    expect(messages[0]).toContain("(lien)");
  });

  it("ignore une insulte déguisée (c0nn4rd), et dit laquelle de la liste", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "t'es un c0nn4rd"));
    expect(spoken).toEqual([]);
    expect(messages[0]).toContain("(insulte : « connard »)");
  });

  it("ignore un message trop long, du spam, ou fait d'emotes seulement", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "bonjour ".repeat(30)));
    await receive(message("2", "lol lol lol lol"));
    await receive(message("3", "KEKW"));
    expect(spoken).toEqual([]);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain("trop long");
    expect(messages[1]).toContain("spam : mot répété");
    expect(messages[2]).toContain("il ne reste que des emotes");
  });

  it("écrit le texte du message sur une ligne, sans retour à la ligne, et le coupe à 100 caractères", async () => {
    const { receive, messages } = setup();
    await receive(message("1", `!x\nligne\u0000deux ${"a".repeat(300)}`, { isCommand: true }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toContain("\n");
    expect(messages[0]).not.toContain("\u0000");
    expect(messages[0]?.length).toBeLessThan(220);
    expect(messages[0]).toContain("…");
  });

  it("n'écrit rien pour un message lu", async () => {
    const { receive, messages } = setup();
    await receive(message("1", "Bonjour"));
    expect(messages).toEqual([]);
  });
});

describe("createFoxChat : un message par viewer toutes les 10 s", () => {
  it("lit le premier message d'un viewer, ignore le second arrivé en moins de 10 s", async () => {
    const { receive, spoken, messages, advance } = setup();
    await receive(message("1", "Premier", { viewerId: "same" }));
    await advance(9000);
    await receive(message("2", "Second", { viewerId: "same" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Premier"]);
    expect(messages).toEqual([
      "Renard : message de Viewer2 ignoré (même viewer lu il y a moins de 10 s) : « Second »",
    ]);
  });

  it("relit un viewer au bout de 10 s", async () => {
    const { receive, spoken, advance, finishSynthesis } = setup();
    await receive(message("1", "Premier", { viewerId: "same" }));
    await finishSynthesis(0, 1000);
    await advance(10_000);
    await receive(message("2", "Second", { viewerId: "same" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });

  it("ne retient pas un autre viewer : son message attend son tour, sans être ignoré", async () => {
    const { receive, spoken, messages, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    expect(messages).toEqual([]);
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });

  it("ne repart pas le délai d'un message ignoré par le filtre ou par le délai", async () => {
    const { receive, spoken, advance, finishSynthesis } = setup();
    await receive(message("1", "!lurk", { viewerId: "same", isCommand: true }));
    await receive(message("2", "Bonjour", { viewerId: "same" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour"]);
    await finishSynthesis(0, 500);
    await advance(6000);
    await receive(message("3", "Encore", { viewerId: "same" }));
    expect(spoken).toHaveLength(1);
    await advance(4000);
    await receive(message("4", "Enfin", { viewerId: "same" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour", "Enfin"]);
  });

  it("suit le délai réglé", async () => {
    const { receive, spoken, advance, foxChat, finishSynthesis } = setup();
    foxChat.update({ ...settings, foxReadGap: 2000 });
    await receive(message("1", "Premier", { viewerId: "same" }));
    await finishSynthesis(0, 500);
    await advance(2000);
    await receive(message("2", "Second", { viewerId: "same" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });
});

describe("createFoxChat : la file de 3 messages", () => {
  it("ignore le quatrième message quand trois attendent d'être lus, celui qu'on lit compris", async () => {
    const { receive, spoken, messages } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await receive(message("3", "Troisième"));
    await receive(message("4", "Quatrième"));
    expect(messages).toEqual([
      "Renard : message de Viewer4 ignoré (file pleine : 3 messages) : « Quatrième »",
    ]);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier"]);
  });

  it("n'a plus de quatrième à refuser quand une place se libère", async () => {
    const { receive, spoken, finishSynthesis, advance } = setup();
    for (const id of ["1", "2", "3"]) await receive(message(id, `Message ${id}`));
    await finishSynthesis(0, 1000);
    await advance(1400);
    await receive(message("4", "Message 4"));
    await finishSynthesis(1, 1000);
    await advance(1400);
    await finishSynthesis(2, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Message 1", "Message 2", "Message 3", "Message 4"]);
  });

  it("suit la taille réglée", async () => {
    const { receive, spoken, messages, foxChat } = setup();
    foxChat.update({ ...settings, foxReadQueueSize: 1 });
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    expect(spoken).toHaveLength(1);
    expect(messages[0]).toContain("file pleine : 1 messages");
  });
});

describe("createFoxChat : la modération", () => {
  it("ne lit jamais un message supprimé alors qu'il attend", async () => {
    const { receive, spoken, finishSynthesis, deleteMessage, advance, messages } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Supprimé"));
    await receive(message("3", "Troisième"));
    await deleteMessage("2");
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Troisième"]);
    expect(messages.join("\n")).toContain("message de Viewer2 retiré de la file");
  });

  it("arrête la lecture d'un message supprimé pendant qu'il est lu, et passe au suivant", async () => {
    const { receive, spoken, stops, finishSynthesis, deleteMessage } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await finishSynthesis(0, 5000);
    expect(stops.count).toBe(0);
    await deleteMessage("1");
    expect(stops.count).toBe(1);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });

  it("ne lit pas un message supprimé pendant sa synthèse : la phrase est annulée avant d'être envoyée", async () => {
    const { receive, spoken, stops, deleteMessage } = setup();
    await receive(message("1", "Supprimé"));
    expect(spoken[0]?.isCancelled()).toBe(false);
    await deleteMessage("1");
    expect(spoken[0]?.isCancelled()).toBe(true);
    expect(stops.count).toBe(0);
    spoken[0]?.settle({ ok: false, status: 409, message: "la phrase a été annulée" });
  });

  it("rattrape un message supprimé juste après l'envoi de sa phrase : il arrête la lecture", async () => {
    const { receive, spoken, stops, deleteMessage, flush } = setup();
    await receive(message("1", "Premier"));
    spoken[0]?.settle({ ok: true, url: "/api/fox/speech/0", durationMs: 3000 });
    // La suppression arrive avant que le renard ait vu la fin de la synthèse.
    await deleteMessage("1");
    await flush();
    expect(stops.count).toBe(1);
  });

  it("retire de la file tous les messages d'un viewer banni ou en timeout", async () => {
    const { receive, spoken, finishSynthesis, deleteViewer, advance } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Du banni", { viewerId: "banni" }));
    await receive(message("3", "Troisième"));
    await deleteViewer("banni");
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Troisième"]);
  });

  it("arrête la lecture quand le viewer qu'il lit est banni", async () => {
    const { receive, spoken, stops, finishSynthesis, deleteViewer } = setup();
    await receive(message("1", "Du banni", { viewerId: "banni" }));
    await receive(message("2", "Suivant"));
    await finishSynthesis(0, 5000);
    await deleteViewer("banni");
    expect(stops.count).toBe(1);
    expect(spoken.map(({ text }) => text)).toEqual(["Du banni", "Suivant"]);
  });

  it("ne fait rien pour la suppression d'un message qui n'est pas dans la file", async () => {
    const { receive, spoken, stops, deleteMessage, deleteViewer } = setup();
    await receive(message("1", "Premier"));
    await deleteMessage("inconnu");
    await deleteViewer("inconnu");
    expect(stops.count).toBe(0);
    expect(spoken).toHaveLength(1);
  });

  it("ne coupe pas la lecture d'un autre message quand le message supprimé a déjà été lu", async () => {
    const { receive, stops, finishSynthesis, advance, deleteMessage } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await finishSynthesis(0, 1000);
    await advance(1400);
    await deleteMessage("1");
    expect(stops.count).toBe(0);
  });
});

describe("createFoxChat : « Lire le tchat » et « Lire mes messages »", () => {
  const off: Settings = { ...settings, foxShouldReadChat: false };

  it("ne lit aucun message quand « Lire le tchat » est désactivé, et ne journalise pas chaque message", async () => {
    const { receive, spoken, messages } = setup(off);
    await receive(message("1", "Bonjour"));
    await receive(message("2", "!lurk", { isCommand: true }));
    expect(spoken).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("vide la file et arrête la lecture quand on le désactive, et le dit une fois", async () => {
    const { receive, spoken, stops, finishSynthesis, foxChat, messages } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await finishSynthesis(0, 5000);
    foxChat.update(off);
    expect(stops.count).toBe(1);
    expect(spoken).toHaveLength(1);
    expect(messages).toEqual(["Renard : lecture du tchat désactivée."]);
    foxChat.update({ ...off, threshold: -30 });
    expect(messages).toHaveLength(1);
  });

  it("reprend la lecture quand on le réactive : les messages suivants sont lus", async () => {
    const { receive, spoken, foxChat, messages } = setup(off);
    foxChat.update(settings);
    await receive(message("1", "Bonjour"));
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour"]);
    expect(messages).toEqual(["Renard : lecture du tchat activée."]);
  });

  it("lit les messages du compte de la chaîne quand « Lire mes messages » est activé", async () => {
    const { receive, spoken } = setup();
    await receive(message("1", "Bienvenue à tous", { viewerLogin: "Fenysk", nickname: "Fenysk" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Bienvenue à tous"]);
  });

  it("ignore les messages du compte de la chaîne quand il est désactivé, et lit les autres", async () => {
    const { receive, spoken, messages } = setup({ ...settings, foxShouldReadOwn: false });
    await receive(message("1", "Bienvenue à tous", { viewerLogin: "Fenysk", nickname: "Fenysk" }));
    await receive(message("2", "Merci", { viewerLogin: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Merci"]);
    expect(messages).toEqual([
      "Renard : message de Fenysk ignoré (message du compte de la chaîne) : « Bienvenue à tous »",
    ]);
  });

  it("applique le changement sans redémarrer : « Lire mes messages » se règle en direct", async () => {
    const { receive, spoken, foxChat, finishSynthesis, advance } = setup();
    foxChat.update({ ...settings, foxShouldReadOwn: false });
    await receive(message("1", "Moi", { viewerLogin: "fenysk" }));
    expect(spoken).toEqual([]);
    foxChat.update(settings);
    await receive(message("2", "Moi encore", { viewerLogin: "fenysk", viewerId: "owner" }));
    await finishSynthesis(0);
    await advance(0);
    expect(spoken.map(({ text }) => text)).toEqual(["Moi encore"]);
  });

  it("suit la liste des bots changée dans les réglages", async () => {
    const { receive, spoken, foxChat } = setup();
    foxChat.update({ ...settings, chatBots: ["alice"] });
    await receive(message("1", "Bonjour", { viewerLogin: "alice" }));
    expect(spoken).toEqual([]);
  });

  it("ne lit rien quand settings.json n'a pas les réglages du renard", async () => {
    const { foxChat, receive, spoken } = setup({
      obsAddress: settings.obsAddress,
      micName: "x",
      threshold: -40,
      delay: 250,
    });
    await receive(message("1", "Bonjour"));
    expect(spoken).toEqual([]);
    foxChat.stop();
  });
});

describe("createFoxChat : quand la synthèse échoue", () => {
  it("le dit, et passe au message suivant au lieu de rester bloqué", async () => {
    const { receive, spoken, messages, flush } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    spoken[0]?.settle({ ok: false, status: 502, message: "la synthèse a échoué : PowerShell introuvable" });
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
    expect(messages).toEqual([
      "Renard : message de Viewer1 non lu : la synthèse a échoué : PowerShell introuvable",
    ]);
  });

  it("ne dit rien d'une phrase annulée : ce n'est pas un échec", async () => {
    const { receive, spoken, messages, deleteMessage } = setup();
    await receive(message("1", "Supprimé"));
    await deleteMessage("1");
    spoken[0]?.settle({ ok: false, status: 409, message: "la phrase a été annulée" });
    expect(messages.filter((line) => line.includes("non lu"))).toEqual([]);
  });
});

describe("createFoxChat : D, il attend qu'Alexis se taise et coupe s'il parle trop", () => {
  const quiet = { isTalking: false, talkingFor: 0, silentFor: 5000 };
  const speaking = (talkingFor: number) => ({ isTalking: true, talkingFor, silentFor: 0 });

  it("garde le message en file tant qu'Alexis ne se tait pas depuis 1 s, puis le lit", async () => {
    const { receive, spoken, stub, flush } = setup();
    Object.assign(stub.voice, speaking(300));
    await receive(message("1", "Bonjour"));
    expect(spoken).toEqual([]);
    Object.assign(stub.voice, { isTalking: false, talkingFor: 0, silentFor: 999 });
    stub.tick();
    await flush();
    expect(spoken).toEqual([]);
    stub.voice.silentFor = 1000;
    stub.tick();
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour"]);
  });

  it("lit le message tout de suite quand Alexis se tait depuis plus d'1 s à son arrivée", async () => {
    const { receive, spoken, stub } = setup();
    Object.assign(stub.voice, quiet);
    await receive(message("1", "Bonjour"));
    expect(spoken).toHaveLength(1);
  });

  it("coupe la lecture quand Alexis parle plus d'1 s, pas à 1 s pile", async () => {
    const { receive, spoken, stops, stub, finishSynthesis, flush, messages } = setup();
    await receive(message("1", "Premier"));
    await finishSynthesis(0, 5000);
    Object.assign(stub.voice, speaking(1000));
    stub.tick();
    await flush();
    expect(stops.count).toBe(0);
    stub.voice.talkingFor = 1001;
    stub.tick();
    expect(stops.count).toBe(1);
    expect(messages).toEqual(["Renard : lecture abandonnée, Alexis parle (message de Viewer1)."]);
    expect(spoken).toHaveLength(1);
  });

  it("n'en reprend jamais le message, même quand Alexis se tait ensuite", async () => {
    const { receive, spoken, stub, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier"));
    await finishSynthesis(0, 5000);
    Object.assign(stub.voice, speaking(1500));
    stub.tick();
    Object.assign(stub.voice, quiet);
    for (let step = 0; step < 50; step += 1) {
      await advance(1000);
      stub.tick();
    }
    expect(spoken.map(({ text }) => text)).toEqual(["Premier"]);
  });

  it("passe au message suivant seulement quand Alexis s'est tu depuis 1 s", async () => {
    const { receive, spoken, stub, finishSynthesis, flush } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await finishSynthesis(0, 5000);
    Object.assign(stub.voice, speaking(1500));
    stub.tick();
    await flush();
    expect(spoken).toHaveLength(1);
    Object.assign(stub.voice, { isTalking: false, talkingFor: 0, silentFor: 1000 });
    stub.tick();
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Second"]);
  });

  it("annule la phrase et l'entrée en scène quand Alexis parle plus d'1 s avant que la lecture commence", async () => {
    const { receive, spoken, stops, stub } = setup();
    stub.holdIntros();
    await receive(message("1", "Premier"));
    Object.assign(stub.voice, speaking(1001));
    stub.tick();
    expect(spoken[0]?.isCancelled()).toBe(true);
    expect(stub.calls.intros[0]?.isCancelled).toBe(true);
    expect(stops.count).toBe(0);
    expect(stub.calls.spokes).toBe(0);
  });

  it("suit les durées réglées : silence avant lecture et coupure", async () => {
    const { receive, spoken, stops, stub, foxChat, finishSynthesis, flush } = setup();
    foxChat.update({ ...settings, foxReadSilence: 3000, foxStopAfter: 2500 });
    Object.assign(stub.voice, { isTalking: false, talkingFor: 0, silentFor: 2999 });
    await receive(message("1", "Bonjour"));
    expect(spoken).toEqual([]);
    stub.voice.silentFor = 3000;
    stub.tick();
    await flush();
    expect(spoken).toHaveLength(1);
    await finishSynthesis(0, 9000);
    Object.assign(stub.voice, speaking(2500));
    stub.tick();
    expect(stops.count).toBe(0);
    stub.voice.talkingFor = 2501;
    stub.tick();
    expect(stops.count).toBe(1);
  });

  it("marque la fin de sa phrase au renard, lue jusqu'au bout ou coupée en cours de route", async () => {
    const { receive, stub, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier"));
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(stub.calls.spokes).toBe(1);
    await receive(message("2", "Second", { viewerId: "autre" }));
    await finishSynthesis(1, 5000);
    Object.assign(stub.voice, speaking(2000));
    stub.tick();
    expect(stub.calls.spokes).toBe(2);
  });
});

describe("createFoxChat : H, un message accepté réveille le renard", () => {
  it("le réveille à l'arrivée d'un message accepté, pas pour un message ignoré par le filtre", async () => {
    const { receive, stub } = setup();
    await receive(message("1", "!lurk", { isCommand: true }));
    await receive(message("2", "va voir https://exemple.com"));
    await receive(message("3", "t'es un c0nn4rd"));
    expect(stub.calls.wakes).toBe(0);
    await receive(message("4", "Bonjour"));
    expect(stub.calls.wakes).toBe(1);
  });

  it("ne le réveille pas pour un message ignoré par le pace ou la file pleine", async () => {
    const { receive, stub } = setup();
    await receive(message("1", "Premier", { viewerId: "same" }));
    await receive(message("2", "Second", { viewerId: "same" }));
    expect(stub.calls.wakes).toBe(1);
  });

  it("le garde là tant qu'un message attend, même quand Alexis parle : il ne part pas avec un message en file", async () => {
    const { receive, stub } = setup();
    Object.assign(stub.voice, { isTalking: true, talkingFor: 200, silentFor: 0 });
    await receive(message("1", "Bonjour"));
    expect(stub.calls.wakes).toBe(1);
    stub.tick();
    stub.tick();
    expect(stub.calls.wakes).toBe(3);
  });

  it("le laisse tranquille quand rien n'attend", async () => {
    const { stub } = setup();
    stub.tick();
    stub.tick();
    expect(stub.calls.wakes).toBe(0);
  });
});

describe("createFoxChat : E et G, ce que le renard montre avant de lire", () => {
  const WAVE: Show = { kind: "wave" };
  const reaction = (image: "front-smile-rest" | "left-large-rest" | "wink-tongue-rest"): Show => ({
    kind: "reaction",
    image,
  });

  // Le viewer est salué par un premier message, puis un second, 10 s plus tard, porte le mot-clé.
  const getSecondShow = async (text: string, overrides: Partial<RawMessage> = {}) => {
    const harness = setup();
    await harness.receive(message("1", "Bonjour", { viewerId: "alice", ...overrides }));
    await harness.finishSynthesis(0, 500);
    await harness.advance(10_000);
    await harness.receive(message("2", text, { viewerId: "alice", ...overrides }));
    return harness.stub.calls.intros[1]?.show;
  };

  it("fait coucou au premier message d'un viewer", async () => {
    const { receive, stub } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([WAVE]);
  });

  it("ne refait pas coucou au deuxième message du même viewer, ni à celui d'un autre déjà lu", async () => {
    expect(await getSecondShow("Ça va ?")).toBeNull();
  });

  it("fait coucou à chaque nouveau viewer, une seule fois chacun", async () => {
    const { receive, stub, finishSynthesis, advance } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    await receive(message("2", "Salut", { viewerId: "bob" }));
    await finishSynthesis(0, 500);
    await advance(900);
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([WAVE, WAVE]);
  });

  it("ne fait jamais coucou au compte de la chaîne", async () => {
    const own = { viewerId: "owner", viewerLogin: "Fenysk", nickname: "Fenysk" };
    const { receive, stub, finishSynthesis, advance } = setup();
    await receive(message("1", "Bienvenue", own));
    await finishSynthesis(0, 500);
    await advance(10_000);
    await receive(message("2", "Re-bienvenue", own));
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([null, null]);
  });

  it("ne compte pas un message ignoré comme un premier message lu : le coucou vient avec le premier message lu", async () => {
    const { receive, stub } = setup();
    await receive(message("1", "!lurk", { viewerId: "alice", isCommand: true }));
    await receive(message("2", "Bonjour", { viewerId: "alice" }));
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([WAVE]);
  });

  it("fait le coucou à la place de la réaction quand le premier message porte un mot-clé", async () => {
    const { receive, stub } = setup();
    await receive(message("1", "gg !", { viewerId: "alice" }));
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([WAVE]);
  });

  it("montre le sourire pour « gg », « <3 » et « Jean Renard »", async () => {
    expect(await getSecondShow("gg")).toEqual(reaction("front-smile-rest"));
    expect(await getSecondShow("je t'aime <3")).toEqual(reaction("front-smile-rest"));
    expect(await getSecondShow("salut Jean Renard")).toEqual(reaction("front-smile-rest"));
  });

  it("montre le choc pour « ?! » et le clin d'œil pour « ;) »", async () => {
    expect(await getSecondShow("quoi ?!")).toEqual(reaction("left-large-rest"));
    expect(await getSecondShow("bien joué ;)")).toEqual(reaction("wink-tongue-rest"));
  });

  it("cherche les mots-clés dans le message écrit, emotes de Twitch comprises", async () => {
    const harness = setup();
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.finishSynthesis(0, 500);
    await harness.advance(10_000);
    await harness.receive(
      message("2", "bravo <3", { viewerId: "alice", emotes: [{ id: "9", start: 6, end: 7 }] }),
    );
    expect(harness.stub.calls.intros[1]?.show).toEqual(reaction("front-smile-rest"));
    expect(harness.spoken[1]?.text).toBe("bravo");
  });

  it("attend la fin de l'entrée en scène pour envoyer la phrase aux pages", async () => {
    const { receive, spoken, stub } = setup();
    stub.holdIntros();
    await receive(message("1", "Bonjour"));
    expect(spoken[0]?.waitFor).toBeInstanceOf(Promise);
    expect(stub.calls.intros).toHaveLength(1);
  });

  it("annule l'entrée en scène d'un message supprimé avant d'être lu", async () => {
    const { receive, deleteMessage, stub, spoken } = setup();
    stub.holdIntros();
    await receive(message("1", "Supprimé"));
    await deleteMessage("1");
    expect(stub.calls.intros[0]?.isCancelled).toBe(true);
    expect(spoken[0]?.isCancelled()).toBe(true);
  });
});

describe("createFoxChat : l'arrêt", () => {
  it("se désabonne du tchat, vide la file et n'attend plus la fin d'une lecture", async () => {
    const { foxChat, receive, spoken, subscribers, pendingTimers, finishSynthesis, stops, stub } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Second"));
    await finishSynthesis(0, 5000);
    expect(pendingTimers()).toBe(1);
    expect(stub.subscribers()).toBe(1);
    foxChat.stop();
    expect(stub.subscribers()).toBe(0);
    expect(subscribers()).toBe(0);
    expect(pendingTimers()).toBe(0);
    expect(stops.count).toBe(1);
    expect(spoken).toHaveLength(1);
  });
});

// Le tchat, le renard et sa voix vrais ; seuls la source du tchat (ComfyJS) et la synthèse (PowerShell) sont faux.
describe("de bout en bout : du message du tchat à la voix du renard", () => {
  const WAV = (() => {
    const bytes = new Uint8Array(44 + 32_000);
    const view = new DataView(bytes.buffer);
    bytes.set([82, 73, 70, 70], 0);
    view.setUint32(4, 36 + 32_000, true);
    bytes.set([87, 65, 86, 69], 8);
    bytes.set([102, 109, 116, 32], 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, 32_000, true);
    bytes.set([100, 97, 116, 97], 36);
    view.setUint32(40, 32_000, true);
    return bytes;
  })();

  const build = () => {
    const state = { now: 500_000, ids: 0 };
    const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
    const logs: string[] = [];
    const synthesized: string[] = [];
    let emit: (event: ChatSourceEvent) => void = () => undefined;
    const source: ChatSource = {
      start(listener) {
        emit = listener;
      },
      stop: () => undefined,
    };
    const voices: VoicePort = {
      async list(): Promise<Voice[]> {
        return [];
      },
      async synthesize({ text }) {
        synthesized.push(text);
        return WAV;
      },
    };
    const chat = createChat({ source, settings, clock: () => state.now });
    const fox = createFox({
      voices,
      settings,
      clock: () => state.now,
      createId: () => {
        state.ids += 1;
        return `s${state.ids}`;
      },
      toSpeechUrl: (id) => `/api/fox/speech/${id}`,
      log: (line) => logs.push(line),
    });
    const events: string[] = [];
    fox.subscribe("screen", (event) => events.push(event.kind === "speech" ? event.url : event.kind));
    const queue = createFoxQueue({
      fox,
      mode: createStubMode().mode,
      settings,
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
    const foxChat = createFoxChat({
      chat,
      queue,
      mode: { flash: () => 0 },
      emotes: { getNames: () => [] },
      regulars: { noteMessage: () => null },
      tally: { noteMessage: () => undefined },
      attitude: { noteMessage: () => null },
      settings,
      insults,
      clock: () => state.now,
      log: (line) => logs.push(line),
    });
    chat.start();
    queue.start();
    foxChat.start();
    const send = async (raw: RawMessage) => {
      emit({ kind: "message", message: raw });
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    };
    const advance = async (ms: number) => {
      state.now += ms;
      for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
        timer.isCancelled = true;
        timer.callback();
      }
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    };
    const remove = async (messageId: string) => {
      emit({ kind: "message-deleted", messageId });
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    };
    return { send, advance, remove, events, synthesized, logs };
  };

  it("lit un message normal : la voix dit le texte, la page reçoit l'adresse du WAV", async () => {
    const { send, synthesized, events } = build();
    await send(message("1", "Bonjour Jean-Renard !"));
    expect(synthesized).toEqual(["Bonjour Jean-Renard !"]);
    expect(events).toEqual(["screens", "/api/fox/speech/s1"]);
  });

  it("ignore !lurk, un lien et c0nn4rd : la voix ne dit rien, le journal dit pourquoi", async () => {
    const { send, synthesized, events, logs } = build();
    await send(message("1", "!lurk", { isCommand: true }));
    await send(message("2", "regarde https://exemple.com"));
    await send(message("3", "c0nn4rd"));
    expect(synthesized).toEqual([]);
    expect(events).toEqual(["screens"]);
    expect(logs.map((line) => line.replace(/\) : «.*$/, ")"))).toEqual([
      "Renard : message de Viewer1 ignoré (commande)",
      "Renard : message de Viewer2 ignoré (lien)",
      "Renard : message de Viewer3 ignoré (insulte : « connard »)",
    ]);
  });

  it("lit le premier de deux messages du même viewer en moins de 10 s, ignore le second", async () => {
    const { send, advance, synthesized, logs } = build();
    await send(message("1", "Premier", { viewerId: "same" }));
    await advance(3000);
    await send(message("2", "Second", { viewerId: "same" }));
    expect(synthesized).toEqual(["Premier"]);
    expect(logs.some((line) => line.includes("même viewer lu il y a moins de 10 s"))).toBe(true);
  });

  it("ignore le quatrième message quand la file est pleine", async () => {
    const { send, synthesized, logs } = build();
    for (const id of ["1", "2", "3", "4"]) await send(message(id, `Message ${id}`));
    expect(synthesized).toEqual(["Message 1"]);
    expect(logs.filter((line) => line.includes("file pleine"))).toHaveLength(1);
  });

  it("ne lit jamais un message supprimé alors qu'il attend, et lit les autres à leur tour", async () => {
    const { send, remove, advance, synthesized } = build();
    await send(message("1", "Premier"));
    await send(message("2", "Supprimé"));
    await send(message("3", "Troisième"));
    await remove("2");
    await advance(1000 + 400);
    expect(synthesized).toEqual(["Premier", "Troisième"]);
  });

  it("arrête la lecture d'un message supprimé pendant qu'il est lu : les pages reçoivent « stop »", async () => {
    const { send, remove, events } = build();
    await send(message("1", "Premier"));
    await remove("1");
    expect(events).toEqual(["screens", "/api/fox/speech/s1", "stop"]);
  });
});

describe("createFoxChat : le message qui accompagne un sub ou des bits", () => {
  it("se lit comme un message, texte seul, sans le pseudo", async () => {
    const { foxChat, flush, spoken } = setup();
    foxChat.speakAttached(message("1", "Bravo pour le live", { nickname: "Alice" }));
    await flush();
    expect(spoken.map(({ text }) => text)).toEqual(["Bravo pour le live"]);
  });

  it("passe devant les messages qui attendent, mais pas devant celui qu'on lit", async () => {
    const { receive, foxChat, spoken, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier"));
    await receive(message("2", "Deuxième"));
    foxChat.speakAttached(message("3", "Joint"));
    expect(spoken.map(({ text }) => text)).toEqual(["Premier"]);
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Joint"]);
  });

  it("n'a ni coucou ni réaction : le remerciement a déjà eu la sienne", async () => {
    const { foxChat, flush, stub } = setup();
    foxChat.speakAttached(message("1", "gg Jean-Renard"));
    await flush();
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([null]);
  });

  it("passe le filtre : un lien, une insulte ou une commande ne sont pas lus, et le journal le dit", async () => {
    const { foxChat, flush, spoken, messages } = setup();
    foxChat.speakAttached(message("1", "voir https://exemple.fr/promo"));
    foxChat.speakAttached(message("2", "espèce de connard"));
    foxChat.speakAttached(message("3", "!lurk", { isCommand: true }));
    await flush();
    expect(spoken).toEqual([]);
    expect(messages.map((line) => line.replace(/\) : «.*$/, ")"))).toEqual([
      "Renard : message de Viewer1 ignoré (lien)",
      "Renard : message de Viewer2 ignoré (insulte : « connard »)",
      "Renard : message de Viewer3 ignoré (commande)",
    ]);
  });

  it("n'est soumis ni au délai par viewer ni à la taille de la file", async () => {
    const { receive, foxChat, spoken, finishSynthesis, advance } = setup();
    await receive(message("1", "Premier", { viewerId: "alice" }));
    await receive(message("2", "Deuxième"));
    await receive(message("3", "Troisième"));
    foxChat.speakAttached(message("4", "Joint", { viewerId: "alice" }));
    await finishSynthesis(0, 1000);
    await advance(1400);
    expect(spoken.map(({ text }) => text)).toEqual(["Premier", "Joint"]);
  });

  it("ne se lit jamais quand « Lire le tchat » est désactivé", async () => {
    const { foxChat, flush, spoken } = setup({ ...settings, foxShouldReadChat: false });
    foxChat.speakAttached(message("1", "Bravo"));
    await flush();
    expect(spoken).toEqual([]);
  });

  it("annule sa phrase quand la modération supprime le message, comme un autre", async () => {
    const { foxChat, deleteMessage, flush, spoken } = setup();
    foxChat.speakAttached(message("1", "Bravo"));
    await flush();
    expect(spoken[0]?.isCancelled()).toBe(false);
    await deleteMessage("1");
    expect(spoken[0]?.isCancelled()).toBe(true);
  });
});

describe("createFoxChat : T, la phrase d'accueil des habitués", () => {
  it("dit la phrase d'accueil juste avant le message, d'une seule traite, après le coucou", async () => {
    const { receive, spoken, state, stub } = setup();
    state.welcome = "Un nouveau ! Bienvenue, Alice.";
    await receive(message("1", "Bonjour tout le monde", { viewerId: "alice", nickname: "Alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Un nouveau ! Bienvenue, Alice. Bonjour tout le monde"]);
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([{ kind: "wave" }]);
  });

  it("lit le message seul quand le fichier n'a pas de phrase d'accueil à dire", async () => {
    const { receive, spoken } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Bonjour"]);
  });

  it("annonce au fichier chaque message accepté d'un viewer, avec le droit d'accueillir", async () => {
    const { receive, visits } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice", viewerLogin: "Alice" }));
    expect(visits.map(({ raw, canWelcome }) => [raw.viewerLogin, canWelcome])).toEqual([["Alice", true]]);
  });

  it("n'annonce pas au fichier un message que le filtre ignore, ni celui d'un bot", async () => {
    const { receive, visits } = setup();
    await receive(message("1", "!lurk", { viewerId: "alice", isCommand: true }));
    await receive(message("2", "https://exemple.fr", { viewerId: "bob" }));
    await receive(message("3", "Bonjour", { viewerId: "nightbot", viewerLogin: "nightbot" }));
    expect(visits).toEqual([]);
  });

  it("n'annonce pas au fichier le compte de la chaîne, et ne lui dit aucune phrase d'accueil", async () => {
    const { receive, visits, spoken, state } = setup();
    state.welcome = "Un nouveau ! Bienvenue, Fenysk.";
    await receive(
      message("1", "Bienvenue", { viewerId: "owner", viewerLogin: "Fenysk", nickname: "Fenysk" }),
    );
    expect(visits).toEqual([]);
    expect(spoken.map(({ text }) => text)).toEqual(["Bienvenue"]);
  });

  it("n'annonce rien quand « Lire le tchat » est désactivé", async () => {
    const { receive, visits } = setup({ ...settings, foxShouldReadChat: false });
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(visits).toEqual([]);
  });
});

describe("createFoxChat : U, le compte des messages acceptés", () => {
  it("compte chaque message accepté d'un viewer", async () => {
    const { receive, counted, finishSynthesis, advance } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    await finishSynthesis(0, 500);
    await advance(10_000);
    await receive(message("2", "Re-bonjour", { viewerId: "alice" }));
    expect(counted.map(({ viewerId, text }) => [viewerId, text])).toEqual([
      ["alice", "Bonjour"],
      ["alice", "Re-bonjour"],
    ]);
  });

  it("ne compte pas un message ignoré par le filtre : commande, lien, spam, viewer trop pressé, file pleine", async () => {
    const { receive, counted } = setup();
    await receive(message("1", "!lurk", { viewerId: "alice", isCommand: true }));
    await receive(message("2", "https://exemple.fr", { viewerId: "bob" }));
    await receive(message("3", "aaaaaaaaaaaa", { viewerId: "carole" }));
    await receive(message("4", "Bonjour", { viewerId: "dave" }));
    await receive(message("5", "Encore", { viewerId: "dave" }));
    expect(counted.map(({ viewerId }) => viewerId)).toEqual(["dave"]);
  });

  it("ne compte ni le compte de la chaîne ni un bot", async () => {
    const { receive, counted } = setup();
    await receive(message("1", "Bienvenue", { viewerId: "owner", viewerLogin: "Fenysk" }));
    await receive(message("2", "Bonjour", { viewerId: "nightbot", viewerLogin: "nightbot" }));
    expect(counted).toEqual([]);
  });
});

describe("createFoxChat : Q, les emotes changent sa tête", () => {
  const emoteSettings: Settings = {
    ...settings,
    foxEmoteReactions: ["LUL = sourire", "WutFace = choc", "Kappa = clin"],
    foxEmoteNames: ["KEKW", "LUL", "WutFace", "Kappa"],
  };
  const reaction = (image: "front-smile-rest" | "left-large-rest" | "wink-tongue-rest"): Show => ({
    kind: "reaction",
    image,
  });

  // Le viewer est salué par un premier message, puis un second, 10 s plus tard, porte l'emote.
  const getSecondShow = async (text: string) => {
    const harness = setup(emoteSettings);
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.finishSynthesis(0, 500);
    await harness.advance(10_000);
    await harness.receive(message("2", text, { viewerId: "alice" }));
    return harness.stub.calls.intros[1]?.show;
  };

  it("montre la réaction de l'emote que le message contient, avant de le lire", async () => {
    expect(await getSecondShow("trop drôle LUL")).toEqual(reaction("front-smile-rest"));
    expect(await getSecondShow("hein WutFace quoi")).toEqual(reaction("left-large-rest"));
    expect(await getSecondShow("bien joué Kappa")).toEqual(reaction("wink-tongue-rest"));
  });

  it("ne montre rien pour une emote qui n'est pas dans la liste, ni pour un nom mal écrit", async () => {
    expect(await getSecondShow("trop drôle KEKW")).toBeNull();
    expect(await getSecondShow("trop drôle lul")).toBeNull();
  });

  it("suit la liste changée en direct", async () => {
    const harness = setup(emoteSettings);
    harness.foxChat.update({ ...emoteSettings, foxEmoteReactions: ["KEKW = choc"] });
    await harness.receive(message("1", "Bonjour", { viewerId: "alice" }));
    await harness.finishSynthesis(0, 500);
    await harness.advance(10_000);
    await harness.receive(message("2", "ah KEKW", { viewerId: "alice" }));
    expect(harness.stub.calls.intros[1]?.show).toEqual(reaction("left-large-rest"));
  });

  it("laisse le coucou à la place de la réaction au premier message lu d'un viewer", async () => {
    const { receive, stub } = setup(emoteSettings);
    await receive(message("1", "mdr LUL", { viewerId: "alice" }));
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([{ kind: "wave" }]);
  });

  describe("un message d'emotes seules", () => {
    it("montre la réaction sans rien lire, et sans le faire attendre ou parler", async () => {
      const { receive, flashes, spoken, stub, messages } = setup(emoteSettings);
      await receive(
        message("1", "LUL LUL", {
          emotes: [
            { id: "425618", start: 0, end: 2 },
            { id: "425618", start: 4, end: 6 },
          ],
        }),
      );
      expect(flashes).toEqual([reaction("front-smile-rest")]);
      expect(spoken).toEqual([]);
      expect(stub.calls.wakes).toBe(0);
      expect(stub.calls.intros).toEqual([]);
      expect(messages.at(-1)).toContain("il ne reste que des emotes");
    });

    it("donne la réaction de chaque emote de la liste, emotes de Twitch et de la liste à la main", async () => {
      const { receive, flashes, advance } = setup(emoteSettings);
      await receive(message("1", "WutFace", { viewerId: "a", emotes: [{ id: "28087", start: 0, end: 6 }] }));
      await advance(5000);
      await receive(message("2", "KEKW LUL", { viewerId: "b" }));
      await advance(5000);
      await receive(message("3", "Kappa", { viewerId: "c", emotes: [{ id: "25", start: 0, end: 4 }] }));
      expect(flashes).toEqual([
        reaction("left-large-rest"),
        reaction("front-smile-rest"),
        reaction("wink-tongue-rest"),
      ]);
    });

    it("ne montre rien pour des emotes qui ne sont pas dans la liste", async () => {
      const { receive, flashes } = setup(emoteSettings);
      await receive(message("1", "KEKW KEKW"));
      expect(flashes).toEqual([]);
    });

    it("ne montre qu'une réaction toutes les 5 s", async () => {
      const { receive, flashes, advance } = setup(emoteSettings);
      await receive(message("1", "LUL", { viewerId: "a" }));
      await advance(4999);
      await receive(message("2", "LUL", { viewerId: "b" }));
      expect(flashes).toHaveLength(1);
      await advance(1);
      await receive(message("3", "LUL", { viewerId: "c" }));
      expect(flashes).toHaveLength(2);
    });

    it("ne compte pas pour les 5 s une réaction qui n'a pas pu se montrer (caché, ou autre chose montré)", async () => {
      const { receive, flashes, state } = setup(emoteSettings);
      state.flashMs = 0;
      await receive(message("1", "LUL", { viewerId: "a" }));
      state.flashMs = 1000;
      await receive(message("2", "LUL", { viewerId: "b" }));
      expect(flashes).toHaveLength(2);
    });

    it("ne montre rien quand le renard parle ou va parler : un message ou un remerciement dans la file", async () => {
      const { receive, flashes, finishSynthesis, advance } = setup(emoteSettings);
      await receive(message("1", "Bonjour", { viewerId: "alice" }));
      await receive(message("2", "LUL", { viewerId: "bob" }));
      expect(flashes).toEqual([]);
      await finishSynthesis(0, 1000);
      await advance(1400);
      await receive(message("3", "LUL", { viewerId: "carole" }));
      expect(flashes).toEqual([reaction("front-smile-rest")]);
    });

    it("donne aussi les mots-clés de E : un « ;) » ou « <3 » d'emote de Twitch seul", async () => {
      const { receive, flashes } = setup(emoteSettings);
      await receive(message("1", "<3", { emotes: [{ id: "9", start: 0, end: 1 }] }));
      expect(flashes).toEqual([reaction("front-smile-rest")]);
    });

    it("ne fait rien pour un message ignoré pour une autre raison (lien, commande, spam)", async () => {
      const { receive, flashes } = setup(emoteSettings);
      await receive(message("1", "LUL https://exemple.fr", { viewerId: "a" }));
      await receive(message("2", "!lurk LUL", { viewerId: "b", isCommand: true }));
      await receive(message("3", "aaaaaaaaaaaa", { viewerId: "c" }));
      expect(flashes).toEqual([]);
    });

    it("ne fait rien quand « Lire le tchat » est désactivé", async () => {
      const off = setup({ ...emoteSettings, foxShouldReadChat: false });
      await off.receive(message("1", "LUL"));
      expect(off.flashes).toEqual([]);
    });

    it("ne compte pas comme un viewer lu : ni file, ni pace, ni compte, ni accueil", async () => {
      const { receive, visits, counted } = setup(emoteSettings);
      await receive(message("1", "LUL", { viewerId: "alice" }));
      expect(visits).toEqual([]);
      expect(counted).toEqual([]);
    });
  });
});

describe("createFoxChat : R, l'humeur et la reprise", () => {
  it("dit la phrase de la reprise juste avant le message, d'une seule traite, après le coucou", async () => {
    const { receive, spoken, state, stub } = setup();
    state.resume = "Ah, maintenant vous parlez ?";
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Ah, maintenant vous parlez ? Bonjour"]);
    expect(stub.calls.intros.map(({ show }) => show)).toEqual([{ kind: "wave" }]);
  });

  it("passe avant la phrase d'accueil : une seule phrase avant un message, et l'accueil n'est pas dit", async () => {
    const { receive, spoken, state, visits } = setup();
    state.resume = "Ah, maintenant vous parlez ?";
    state.welcome = "Un nouveau ! Bienvenue, Alice.";
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Ah, maintenant vous parlez ? Bonjour"]);
    expect(visits.map(({ canWelcome }) => canWelcome)).toEqual([false]);
  });

  it("laisse l'accueil quand il n'y a pas de reprise", async () => {
    const { receive, spoken, state, visits } = setup();
    state.welcome = "Un nouveau ! Bienvenue, Alice.";
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(spoken.map(({ text }) => text)).toEqual(["Un nouveau ! Bienvenue, Alice. Bonjour"]);
    expect(visits.map(({ canWelcome }) => canWelcome)).toEqual([true]);
  });

  it("annonce à l'humeur chaque message accepté d'un viewer", async () => {
    const { receive, notes } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    expect(notes).toEqual([{ isAccepted: true }]);
  });

  it("annonce à l'humeur un message que le filtre ignore : le tchat a parlé quand même", async () => {
    const { receive, notes } = setup();
    await receive(message("1", "!lurk", { viewerId: "alice", isCommand: true }));
    await receive(message("2", "https://exemple.fr", { viewerId: "bob" }));
    await receive(message("3", "aaaaaaaaaaaa", { viewerId: "carole" }));
    await receive(message("4", "KEKW", { viewerId: "dave" }));
    expect(notes).toEqual([
      { isAccepted: false },
      { isAccepted: false },
      { isAccepted: false },
      { isAccepted: false },
    ]);
  });

  it("annonce à l'humeur aussi le message d'un viewer lu trop vite", async () => {
    const { receive, notes } = setup();
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    await receive(message("2", "Encore", { viewerId: "alice" }));
    expect(notes).toEqual([{ isAccepted: true }, { isAccepted: false }]);
  });

  it("n'annonce rien à l'humeur pour le compte de la chaîne ni pour un bot", async () => {
    const { receive, notes, state, spoken } = setup();
    state.resume = "Ah, maintenant vous parlez ?";
    await receive(
      message("1", "Bienvenue", { viewerId: "owner", viewerLogin: "Fenysk", nickname: "Fenysk" }),
    );
    await receive(message("2", "Bonjour", { viewerId: "nightbot", viewerLogin: "nightbot" }));
    await receive(
      message("3", "!discord", { viewerId: "nightbot", viewerLogin: "NightBot", isCommand: true }),
    );
    expect(spoken.map(({ text }) => text)).toEqual(["Bienvenue"]);
    expect(notes).toEqual([]);
  });

  it("annonce à l'humeur les messages même quand « Lire le tchat » est désactivé", async () => {
    const { receive, notes, spoken } = setup({ ...settings, foxShouldReadChat: false });
    await receive(message("1", "Bonjour", { viewerId: "alice" }));
    await receive(message("2", "Bienvenue", { viewerId: "owner", viewerLogin: "Fenysk" }));
    expect(notes).toEqual([{ isAccepted: false }]);
    expect(spoken).toEqual([]);
  });
});
