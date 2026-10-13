import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import { JOY_MODE, SMILE_MODE } from "../domain/fox-mode.rules";
import type { LiveEvent } from "../domain/live.types";
import type { Settings } from "../domain/settings.schema";
import type { ChatSourceEvent } from "./chat.usecase";
import type { QueueItem } from "./fox-queue.usecase";
import { createFoxThanks } from "./fox-thanks.usecase";

const base: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  chatChannel: "fenysk",
  foxShouldThank: true,
  foxThankGap: 10_000,
  foxThanksFollow: ["Merci {user} pour le follow."],
  foxThanksFollowGeneric: ["Merci aux nouveaux followers."],
  foxThanksSub: ["Merci {user} pour le sub."],
  foxThanksGiftOne: ["{user} offre un sub à {recipient}."],
  foxThanksGiftMany: ["{user} offre {count} subs."],
  foxThanksCheer: ["Merci {user} pour {bits} bits."],
};

const insults = toInsultList("connard\nsalope");

const message = (text: string): RawMessage => ({
  id: "m1",
  viewerId: "v1",
  viewerLogin: "alice",
  nickname: "Alice",
  color: null,
  text,
  emotes: [],
  isCommand: false,
});

// Le usecase seul, avec une file, un lecteur de message joint et un temps à la main : ce qu'il pousse, et quand.
const setup = (overrides: Partial<Settings> = {}, options: { viewers?: number | null } = {}) => {
  const state = { now: 1_000_000, viewers: options.viewers ?? null, activity: 0 };
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const pushed: QueueItem[] = [];
  const attached: RawMessage[] = [];
  const order: string[] = [];
  const logs: string[] = [];
  const listeners = new Set<(event: ChatSourceEvent) => void>();
  const thanks = createFoxThanks({
    chat: {
      subscribeSource(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    queue: {
      push(item) {
        pushed.push(item);
        order.push(`push:${item.text}`);
      },
    },
    foxChat: {
      speakAttached(raw) {
        attached.push(raw);
        order.push(`attached:${raw.text}`);
      },
    },
    viewers: { getCount: () => state.viewers },
    jab: {
      noteActivity() {
        state.activity += 1;
      },
    },
    settings: { ...base, ...overrides },
    insults,
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
  const run = (ms: number) => {
    const target = state.now + ms;
    for (;;) {
      const due = timers
        .filter(({ at, isCancelled }) => !isCancelled && at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      state.now = Math.max(state.now, due.at);
      due.isCancelled = true;
      due.callback();
    }
    state.now = target;
  };
  const emit = (event: LiveEvent) => {
    for (const listener of listeners) listener({ kind: "live", event });
  };
  return {
    thanks,
    state,
    pushed,
    attached,
    order,
    logs,
    run,
    emit,
    listeners,
    pending: () => timers.filter(({ isCancelled }) => !isCancelled).length,
    texts: () => pushed.map(({ text }) => text),
  };
};

describe("un évènement du live donne une phrase de sa liste, avec ses variables", () => {
  it("remercie un follow : sourire (1 s de front-smile-rest) puis la phrase, nommé", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Merci Alice pour le follow.");
    expect(pushed[0]?.toShow()).toEqual(SMILE_MODE);
    expect(SMILE_MODE).toEqual({ kind: "reaction", image: "front-smile-rest" });
  });

  it("remercie un sub par un saut de joie, puis la phrase", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(pushed[0]?.text).toBe("Merci Alice pour le sub.");
    expect(pushed[0]?.toShow()).toEqual(JOY_MODE);
  });

  it("remercie un sub offert avec son destinataire, par un saut de joie", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "gift", user: "Alice", recipient: "Bob" });
    expect(pushed[0]?.text).toBe("Alice offre un sub à Bob.");
    expect(pushed[0]?.toShow()).toEqual(JOY_MODE);
  });

  it("remercie une série de subs offerts par UNE phrase, avec le nombre de subs", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "mystery-gift", user: "Alice", count: 5 });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Alice offre 5 subs.");
    expect(pushed[0]?.toShow()).toEqual(JOY_MODE);
  });

  it("remercie des bits par un sourire, avec leur nombre", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "cheer", user: "Alice", bits: 100, message: null });
    expect(pushed[0]?.text).toBe("Merci Alice pour 100 bits.");
    expect(pushed[0]?.toShow()).toEqual(SMILE_MODE);
  });

  it("passe devant les messages, attend le silence mais n'est jamais coupé par la voix", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(pushed[0]).toMatchObject({ kind: "thanks", isUrgent: true, isCuttable: false });
  });

  it("compte pour de l'activité dans le live : le silence de la relance repart", () => {
    const { thanks, state } = setup();
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(state.activity).toBe(1);
  });

  it("l'écrit dans le journal, avec la phrase", () => {
    const { thanks, logs } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(logs).toContain("Renard : remerciement (sub) : « Merci Alice pour le sub. »");
  });
});

describe("le tirage des phrases", () => {
  const FOLLOWS = ["Un {user}.", "Deux {user}.", "Trois {user}."];

  it("ne répète pas une phrase avant d'avoir dit toute la liste", () => {
    const { thanks, texts } = setup({ foxThanksSub: FOLLOWS });
    for (let index = 0; index < 3; index += 1) thanks.receive({ kind: "sub", user: "A", message: null });
    expect(new Set(texts()).size).toBe(3);
  });

  it("ne tire pas une phrase de {viewers} quand le nombre est inconnu : jamais « On est . »", () => {
    const { thanks, texts } = setup(
      { foxThanksFollow: ["On est {viewers}, {user}.", "Salut {user}."] },
      { viewers: null },
    );
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(texts()).toEqual(["Salut Alice."]);
  });

  it("peut tirer une phrase de {viewers} quand le nombre est connu, et l'écrit", () => {
    const { thanks, texts } = setup({ foxThanksFollow: ["On est {viewers}, {user}."] }, { viewers: 42 });
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(texts()).toEqual(["On est 42, Alice."]);
  });

  it("n'écrit jamais « On est 0 » : zéro est un nombre inconnu", () => {
    const { thanks, texts } = setup(
      { foxThanksFollow: ["On est {viewers}, {user}.", "Salut {user}."] },
      {
        viewers: 0,
      },
    );
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(texts()).toEqual(["Salut Alice."]);
  });

  it("ne dit rien, et l'écrit, quand aucune phrase n'est possible", () => {
    const { thanks, pushed, logs } = setup({ foxThanksFollow: ["On est {viewers}."] });
    thanks.receive({ kind: "follow", user: "Alice" });
    expect(pushed).toEqual([]);
    expect(logs).toContain("Renard : aucune phrase de remerciement possible pour follow, rien n'est dit.");
  });
});

describe("un pseudo refusé par le filtre d'insultes n'est jamais dit", () => {
  it("un follow prend une phrase sans pseudo", () => {
    const { thanks, texts, logs } = setup();
    thanks.receive({ kind: "follow", user: "connard42" });
    expect(texts()).toEqual(["Merci aux nouveaux followers."]);
    expect(logs.some((line) => line.includes("pseudo refusé"))).toBe(true);
    expect(logs.join("\n")).not.toContain("connard42");
  });

  it("un sub, un destinataire et un cheer disent « quelqu'un » à la place du pseudo", () => {
    const { thanks, texts } = setup();
    thanks.receive({ kind: "sub", user: "connard42", message: null });
    thanks.receive({ kind: "gift", user: "Alice", recipient: "salope" });
    thanks.receive({ kind: "mystery-gift", user: "connard42", count: 3 });
    thanks.receive({ kind: "cheer", user: "connard42", bits: 50, message: null });
    expect(texts()).toEqual([
      "Merci quelqu'un pour le sub.",
      "Alice offre un sub à quelqu'un.",
      "quelqu'un offre 3 subs.",
      "Merci quelqu'un pour 50 bits.",
    ]);
  });

  it("dit un pseudo propre tel quel", () => {
    const { thanks, texts } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(texts()).toEqual(["Merci Alice pour le sub."]);
  });
});

describe("contre les rafales de follows", () => {
  it("10 follows en 2 s : un remerciement nominatif, puis UNE phrase groupée à la fin des 10 s", () => {
    const { thanks, texts, run } = setup();
    for (let index = 0; index < 10; index += 1) {
      thanks.receive({ kind: "follow", user: `Bot${index}` });
      run(200);
    }
    expect(texts()).toEqual(["Merci Bot0 pour le follow."]);
    run(7_999);
    expect(texts()).toEqual(["Merci Bot0 pour le follow."]);
    run(1);
    expect(texts()).toEqual(["Merci Bot0 pour le follow.", "Merci aux nouveaux followers."]);
    run(60_000);
    expect(texts()).toHaveLength(2);
  });

  it("remercie par son nom le follow qui arrive après le délai", () => {
    const { thanks, texts, run } = setup();
    thanks.receive({ kind: "follow", user: "Alice" });
    run(10_000);
    thanks.receive({ kind: "follow", user: "Bob" });
    expect(texts()).toEqual(["Merci Alice pour le follow.", "Merci Bob pour le follow."]);
  });

  it("regroupe en une phrase même un seul follow arrivé pendant le délai : il n'est jamais perdu", () => {
    const { thanks, texts, run } = setup();
    thanks.receive({ kind: "follow", user: "Alice" });
    run(3_000);
    thanks.receive({ kind: "follow", user: "Bob" });
    run(7_000);
    expect(texts()).toEqual(["Merci Alice pour le follow.", "Merci aux nouveaux followers."]);
  });

  it("laisse un nominatif qui arrive pile à la fin du délai passer avant la phrase groupée, qui attend son propre délai", () => {
    const { thanks, texts, run, state } = setup();
    thanks.receive({ kind: "follow", user: "Alice" });
    run(5_000);
    thanks.receive({ kind: "follow", user: "Bob" });
    // Le délai est écoulé, mais la phrase groupée n'est pas encore partie : Carl est remercié par son nom.
    state.now += 5_000;
    thanks.receive({ kind: "follow", user: "Carl" });
    run(0);
    expect(texts()).toEqual(["Merci Alice pour le follow.", "Merci Carl pour le follow."]);
    run(9_999);
    expect(texts()).toHaveLength(2);
    run(1);
    expect(texts()).toEqual([
      "Merci Alice pour le follow.",
      "Merci Carl pour le follow.",
      "Merci aux nouveaux followers.",
    ]);
  });

  it("suit le délai réglé", () => {
    const { thanks, texts, run } = setup({ foxThankGap: 3_000 });
    thanks.receive({ kind: "follow", user: "Alice" });
    run(1_000);
    thanks.receive({ kind: "follow", user: "Bob" });
    run(2_000);
    expect(texts()).toEqual(["Merci Alice pour le follow.", "Merci aux nouveaux followers."]);
  });

  it("ne limite ni les subs ni les cheers : chacun est remercié", () => {
    const { thanks, texts } = setup();
    thanks.receive({ kind: "sub", user: "A", message: null });
    thanks.receive({ kind: "sub", user: "B", message: null });
    thanks.receive({ kind: "cheer", user: "C", bits: 1, message: null });
    expect(texts()).toHaveLength(3);
  });
});

describe("le message qui accompagne un sub ou des bits", () => {
  it("se lit juste après le remerciement", () => {
    const { thanks, attached, order } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: message("Quel bel anniversaire") });
    expect(attached.map(({ text }) => text)).toEqual(["Quel bel anniversaire"]);
    expect(order).toEqual(["push:Merci Alice pour le sub.", "attached:Quel bel anniversaire"]);
  });

  it("retire les cheermotes d'un cheer avant le filtre", () => {
    const { thanks, attached } = setup();
    thanks.receive({
      kind: "cheer",
      user: "Alice",
      bits: 200,
      message: message("Cheer100 Cheer100 bravo Fenysk"),
    });
    expect(attached[0]?.text.trim().split(/\s+/)).toEqual(["bravo", "Fenysk"]);
  });

  it("ne lit rien quand il ne reste que des cheermotes", () => {
    const { thanks, attached, texts } = setup();
    thanks.receive({ kind: "cheer", user: "Alice", bits: 200, message: message("Cheer100 Cheer100") });
    expect(attached).toEqual([]);
    expect(texts()).toEqual(["Merci Alice pour 200 bits."]);
  });

  it("ne lit rien quand le sub n'a pas de message", () => {
    const { thanks, attached } = setup();
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    thanks.receive({ kind: "cheer", user: "Alice", bits: 1, message: null });
    expect(attached).toEqual([]);
  });

  it("ne lit pas un message quand aucune phrase n'a pu être dite", () => {
    const { thanks, attached } = setup({ foxThanksSub: [] });
    thanks.receive({ kind: "sub", user: "Alice", message: message("Bravo") });
    expect(attached).toEqual([]);
  });
});

describe("l'écoute du tchat et les réglages", () => {
  it("remercie les évènements du tchat une fois démarré, pas les messages", () => {
    const { thanks, listeners, texts } = setup();
    thanks.start();
    expect(listeners.size).toBe(1);
    for (const listener of listeners) {
      listener({ kind: "message", message: message("Salut") });
      listener({ kind: "live", event: { kind: "sub", user: "Alice", message: null } });
    }
    expect(texts()).toEqual(["Merci Alice pour le sub."]);
  });

  it("n'écoute plus après l'arrêt, et annule la phrase groupée qui attendait", () => {
    const { thanks, listeners, pending, texts, run } = setup();
    thanks.start();
    thanks.receive({ kind: "follow", user: "A" });
    thanks.receive({ kind: "follow", user: "B" });
    expect(pending()).toBe(1);
    thanks.stop();
    expect(listeners.size).toBe(0);
    expect(pending()).toBe(0);
    run(30_000);
    expect(texts()).toEqual(["Merci A pour le follow."]);
  });

  it("ne remercie rien quand la case est décochée, et reprend quand elle est recochée", () => {
    const { thanks, texts } = setup({ foxShouldThank: false });
    thanks.receive({ kind: "sub", user: "A", message: message("Bravo") });
    thanks.receive({ kind: "follow", user: "B" });
    expect(texts()).toEqual([]);
    thanks.update({ ...base, foxShouldThank: true });
    thanks.receive({ kind: "follow", user: "C" });
    expect(texts()).toEqual(["Merci C pour le follow."]);
  });

  it("annule la phrase groupée qui attendait quand la case est décochée", () => {
    const { thanks, texts, run, pending } = setup();
    thanks.receive({ kind: "follow", user: "A" });
    thanks.receive({ kind: "follow", user: "B" });
    thanks.update({ ...base, foxShouldThank: false });
    expect(pending()).toBe(0);
    run(30_000);
    expect(texts()).toEqual(["Merci A pour le follow."]);
  });

  it("applique les phrases changées dans l'onglet Renard au prochain évènement", () => {
    const { thanks, texts } = setup();
    thanks.update({ ...base, foxThanksSub: ["Nouveau merci {user}."] });
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(texts()).toEqual(["Nouveau merci Alice."]);
  });

  it("ne remercie pas sans les réglages du renard (tous ou aucun)", () => {
    const { thanks, pushed } = setup();
    thanks.update({ obsAddress: base.obsAddress, micName: "x", threshold: -40, delay: 250 });
    thanks.receive({ kind: "sub", user: "Alice", message: null });
    expect(pushed).toEqual([]);
  });
});
