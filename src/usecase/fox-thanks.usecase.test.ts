import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import { JOY_MODE, RAID_MODE, SMILE_MODE } from "../domain/fox-mode.rules";
import type { LiveEvent } from "../domain/live.types";
import type { Settings } from "../domain/settings.schema";
import type { ChatSourceEvent } from "./chat.usecase";
import type { QueueItem } from "./fox-queue.usecase";
import type { Counted } from "./fox-tally.usecase";
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
  foxThanksLurk: ["Merci {user} pour le lurk."],
  foxThanksLurkGeneric: ["Merci pour le lurk."],
  foxTalkativeMessages: 50,
  foxThanksTalkative: ["{user} a écrit {messages} messages."],
  foxThanksRaid: ["{user} débarque avec {viewers}."],
  foxThanksRaidGeneric: ["Un raid de {viewers} !"],
  foxClashRewards: ["Clasher Fenysk"],
  foxWakeRewards: ["Réveiller Jean-Renard"],
  foxThanksWakeAsleep: ["Quoi ?! Je dormais, moi !", "Qui m'a réveillé ? C'est toi, {user} ?"],
  foxThanksWakeAwake: ["Je dors pas, {user}. Je réfléchis."],
  foxThanksPrediction: ["Perdants sur « {issue} » : {perdants}. Courage."],
  foxThanksPredictionNoLoser: ["Tout le monde a gagné. C'est louche."],
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
  const state = {
    now: 1_000_000,
    viewers: options.viewers ?? null,
    activity: 0,
    // Où est le renard au moment du réveil, et les clashs envoyés à la relance.
    presence: "visible" as "visible" | "leaving" | "away" | "returning",
    clashes: [] as string[],
  };
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const pushed: QueueItem[] = [];
  const attached: RawMessage[] = [];
  const order: string[] = [];
  const logs: string[] = [];
  const listeners = new Set<(event: ChatSourceEvent) => void>();
  const tallyListeners = new Set<(counted: Counted) => void>();
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
    tally: {
      subscribe(listener) {
        tallyListeners.add(listener);
        return () => {
          tallyListeners.delete(listener);
        };
      },
    },
    fox: { getPresence: () => ({ kind: state.presence, elapsed: 0 }) },
    jab: {
      noteActivity() {
        state.activity += 1;
      },
      clash(user) {
        state.clashes.push(user);
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
  // Le compte d'un viewer après l'un de ses messages.
  const count = (counted: Counted) => {
    for (const listener of tallyListeners) listener(counted);
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
    count,
    listeners,
    tallyListeners,
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

  it("remercie un raid par un long coucou (mode raid), puis la phrase avec le nombre de viewers", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "raid", user: "Alice", viewers: 12 });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Alice débarque avec 12 personnes.");
    expect(pushed[0]?.toShow()).toEqual(RAID_MODE);
    expect(RAID_MODE).toEqual({ kind: "raid" });
    expect(pushed[0]).toMatchObject({ kind: "thanks", isUrgent: true, isCuttable: false });
  });

  it("écrit « 1 personne » pour un raid d'un seul viewer, sans lire le nombre de viewers du live", () => {
    const { thanks, texts } = setup({}, { viewers: 99 });
    thanks.receive({ kind: "raid", user: "Alice", viewers: 1 });
    expect(texts()).toEqual(["Alice débarque avec 1 personne."]);
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

describe("les récompenses de points de chaîne", () => {
  const reward = (user: string, title: string): LiveEvent => ({ kind: "reward", user, title });

  it("« Clasher Fenysk » : une pique tout de suite, donnée à la relance avec le pseudo ; aucune phrase de remerciement", () => {
    const { thanks, state, pushed } = setup();
    thanks.receive(reward("Alice", "Clasher Fenysk"));
    expect(state.clashes).toEqual(["Alice"]);
    expect(pushed).toEqual([]);
  });

  it("reconnaît un titre sans tenir compte des majuscules ni des espaces aux bords", () => {
    const { thanks, state } = setup();
    thanks.receive(reward("Alice", "  clasher fenysk "));
    thanks.receive(reward("Bob", "CLASHER FENYSK"));
    expect(state.clashes).toEqual(["Alice", "Bob"]);
  });

  it("ignore toute autre récompense, sans rien dire ni rien écrire au journal", () => {
    const { thanks, state, pushed, logs } = setup();
    thanks.receive(reward("Alice", "Hydrate-toi"));
    thanks.receive(reward("Alice", "Clasher Fenysk et Bob"));
    expect(state.clashes).toEqual([]);
    expect(pushed).toEqual([]);
    expect(logs).toEqual([]);
    expect(state.activity).toBe(0);
  });

  it("un pseudo refusé par le filtre d'insultes devient « quelqu'un » pour le clash, et n'est pas écrit au journal", () => {
    const { thanks, state, logs } = setup();
    thanks.receive(reward("connard42", "Clasher Fenysk"));
    expect(state.clashes).toEqual(["quelqu'un"]);
    expect(logs).toEqual(["Renard : pseudo refusé par le filtre d'insultes (clash), il n'est pas dit."]);
    expect(logs.join("\n")).not.toContain("connard42");
  });

  it("« Réveiller Jean-Renard » alors qu'il est visible : « Je dors pas », sans rien montrer avant", () => {
    const { thanks, pushed } = setup();
    thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Je dors pas, Alice. Je réfléchis.");
    expect(pushed[0]?.toShow()).toBeNull();
    expect(pushed[0]).toMatchObject({ kind: "thanks", isUrgent: true, isCuttable: false });
  });

  it("« Réveiller Jean-Renard » alors qu'il n'est pas visible (il part, il est parti, il revient) : l'autre liste", () => {
    for (const presence of ["leaving", "away", "returning"] as const) {
      const { thanks, state, texts } = setup();
      state.presence = presence;
      thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
      expect(texts(), presence).toEqual(["Quoi ?! Je dormais, moi !"]);
    }
  });

  it("tire la phrase du réveil sans répéter avant d'avoir tout dit, et y écrit le pseudo", () => {
    const { thanks, state, texts } = setup();
    state.presence = "away";
    thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
    thanks.receive(reward("Bob", "Réveiller Jean-Renard"));
    expect(texts()).toEqual(["Quoi ?! Je dormais, moi !", "Qui m'a réveillé ? C'est toi, Bob ?"]);
  });

  it("un pseudo refusé devient « quelqu'un » dans la phrase du réveil", () => {
    const { thanks, texts, logs } = setup();
    thanks.receive(reward("connard42", "Réveiller Jean-Renard"));
    expect(texts()).toEqual(["Je dors pas, quelqu'un. Je réfléchis."]);
    expect(logs.join("\n")).not.toContain("connard42");
  });

  it("le réveil compte pour de l'activité dans le live, et l'écrit dans le journal", () => {
    const { thanks, state, logs } = setup();
    thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
    expect(state.activity).toBe(1);
    expect(logs).toContain("Renard : remerciement (réveil) : « Je dors pas, Alice. Je réfléchis. »");
  });

  it("ne fait rien case décochée, et reprend quand elle est recochée", () => {
    const { thanks, state, texts } = setup({ foxShouldThank: false });
    thanks.receive(reward("Alice", "Clasher Fenysk"));
    thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
    expect(state.clashes).toEqual([]);
    expect(texts()).toEqual([]);
    thanks.update({ ...base, foxShouldThank: true });
    thanks.receive(reward("Bob", "Clasher Fenysk"));
    expect(state.clashes).toEqual(["Bob"]);
  });

  it("suit les titres changés en direct, et une liste vide ne reconnaît rien", () => {
    const { thanks, state, texts } = setup();
    thanks.update({ ...base, foxClashRewards: ["Piquer Fenysk"], foxWakeRewards: [] });
    thanks.receive(reward("Alice", "Clasher Fenysk"));
    thanks.receive(reward("Alice", "Réveiller Jean-Renard"));
    expect(state.clashes).toEqual([]);
    expect(texts()).toEqual([]);
    thanks.receive(reward("Alice", "piquer fenysk"));
    expect(state.clashes).toEqual(["Alice"]);
  });

  it("arrive par le tchat comme par EventSub : une fois démarré, le renard écoute les récompenses du flux", () => {
    const { thanks, listeners, state } = setup();
    thanks.start();
    for (const listener of listeners) listener({ kind: "live", event: reward("Alice", "Clasher Fenysk") });
    expect(state.clashes).toEqual(["Alice"]);
  });
});

describe("les prédictions terminées", () => {
  it("dit les perdants et l'issue au tchat, sans rien montrer avant, devant les messages, sans être coupé", () => {
    const { thanks, pushed } = setup();
    thanks.receive({ kind: "prediction", losers: 12, outcome: "Victoire" });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Perdants sur « Victoire » : 12 personnes. Courage.");
    expect(pushed[0]?.toShow()).toBeNull();
    expect(pushed[0]).toMatchObject({ kind: "thanks", isUrgent: true, isCuttable: false });
  });

  it("écrit « 1 personne » pour un seul perdant", () => {
    const { thanks, texts } = setup();
    thanks.receive({ kind: "prediction", losers: 1, outcome: "Défaite" });
    expect(texts()).toEqual(["Perdants sur « Défaite » : 1 personne. Courage."]);
  });

  it("sans perdant : tout le monde a gagné", () => {
    const { thanks, texts } = setup();
    thanks.receive({ kind: "prediction", losers: 0, outcome: null });
    expect(texts()).toEqual(["Tout le monde a gagné. C'est louche."]);
  });

  it("tire la phrase sans répéter avant d'avoir tout dit", () => {
    const { thanks, texts } = setup({
      foxThanksPrediction: ["Un {perdants} {issue}.", "Deux {perdants} {issue}."],
    });
    thanks.receive({ kind: "prediction", losers: 2, outcome: "A" });
    thanks.receive({ kind: "prediction", losers: 2, outcome: "A" });
    expect(new Set(texts()).size).toBe(2);
  });

  it("compte pour de l'activité dans le live, et l'écrit dans le journal", () => {
    const { thanks, state, logs } = setup();
    thanks.receive({ kind: "prediction", losers: 3, outcome: "Oui" });
    expect(state.activity).toBe(1);
    expect(logs).toContain(
      "Renard : remerciement (prédiction) : « Perdants sur « Oui » : 3 personnes. Courage. »",
    );
  });

  it("ne dit rien case décochée", () => {
    const { thanks, texts } = setup({ foxShouldThank: false });
    thanks.receive({ kind: "prediction", losers: 3, outcome: "Oui" });
    expect(texts()).toEqual([]);
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

  it("un raid prend une phrase sans pseudo, avec le nombre de viewers", () => {
    const { thanks, texts, logs } = setup();
    thanks.receive({ kind: "raid", user: "connard42", viewers: 30 });
    expect(texts()).toEqual(["Un raid de 30 personnes !"]);
    expect(logs.some((line) => line.includes("pseudo refusé"))).toBe(true);
    expect(logs.join("\n")).not.toContain("connard42");
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

describe("un message « !lurk » est remercié comme un follow", () => {
  // Le usecase écoute le tchat dès le départ : ces tests parlent par ses messages.
  const started = (overrides: Partial<Settings> = {}) => {
    const harness = setup(overrides);
    harness.thanks.start();
    return harness;
  };

  const say = (
    listeners: Set<(event: ChatSourceEvent) => void>,
    text: string,
    overrides: Partial<RawMessage> = {},
  ) => {
    for (const listener of listeners)
      listener({ kind: "message", message: { ...message(text), ...overrides } });
  };

  it("remercie par un sourire d'1 s puis une phrase avec le pseudo, devant les messages, sans être coupé", () => {
    const { listeners, pushed, state } = started();
    say(listeners, "!lurk");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      kind: "thanks",
      text: "Merci Alice pour le lurk.",
      isCuttable: false,
      isUrgent: true,
    });
    expect(pushed[0]?.toShow()).toEqual(SMILE_MODE);
    expect(state.activity).toBe(1);
  });

  it("écrit le remerciement au journal", () => {
    const { listeners, logs } = started();
    say(listeners, "!lurk");
    expect(logs).toEqual(["Renard : remerciement (lurk) : « Merci Alice pour le lurk. »"]);
  });

  it("reconnaît !lurk sans tenir compte des majuscules, suivi ou non d'un texte", () => {
    const { listeners, texts } = started();
    say(listeners, "!LURK à tout à l'heure", { viewerId: "v1" });
    say(listeners, "!Lurk", { viewerId: "v2", nickname: "Bob" });
    expect(texts()).toEqual(["Merci Alice pour le lurk.", "Merci Bob pour le lurk."]);
  });

  it("ne remercie un viewer qu'une fois depuis le démarrage : le deuxième !lurk ne dit rien", () => {
    const { listeners, texts } = started();
    say(listeners, "!lurk");
    say(listeners, "!lurk");
    say(listeners, "!LURK encore");
    expect(texts()).toEqual(["Merci Alice pour le lurk."]);
    say(listeners, "!lurk", { viewerId: "v2", nickname: "Bob" });
    expect(texts()).toEqual(["Merci Alice pour le lurk.", "Merci Bob pour le lurk."]);
  });

  it("ne remercie ni un message ordinaire, ni une autre commande, ni un !lurk qui n'est pas le premier mot", () => {
    const { listeners, pushed } = started();
    say(listeners, "bonne soirée à tous");
    say(listeners, "!discord");
    say(listeners, "bonne soirée, !lurk");
    say(listeners, "!lurker");
    expect(pushed).toEqual([]);
  });

  it("ne dit jamais un pseudo refusé par le filtre d'insultes : la phrase générique", () => {
    const { listeners, texts, logs } = started();
    say(listeners, "!lurk", { nickname: "connard" });
    expect(texts()).toEqual(["Merci pour le lurk."]);
    expect(logs.join("\n")).not.toContain("connard");
    expect(logs).toContain("Renard : pseudo refusé par le filtre d'insultes (lurk), il n'est pas dit.");
  });

  it("ne remercie rien quand la case des remerciements est décochée", () => {
    const { listeners, pushed } = started({ foxShouldThank: false });
    say(listeners, "!lurk");
    expect(pushed).toEqual([]);
  });

  it("remercie de nouveau après que la case a été recochée : un lurk ignoré ne compte pas comme remercié", () => {
    const { thanks, listeners, texts } = started({ foxShouldThank: false });
    say(listeners, "!lurk");
    thanks.update({ ...base, foxShouldThank: true });
    say(listeners, "!lurk");
    expect(texts()).toEqual(["Merci Alice pour le lurk."]);
  });

  it("tire les phrases de la liste sans répéter avant d'avoir tout dit, et suit la liste changée en direct", () => {
    const { thanks, listeners, texts } = started({ foxThanksLurk: ["A {user}", "B {user}"] });
    say(listeners, "!lurk", { viewerId: "v1", nickname: "Al" });
    say(listeners, "!lurk", { viewerId: "v2", nickname: "Bo" });
    say(listeners, "!lurk", { viewerId: "v3", nickname: "Cy" });
    expect(texts()).toEqual(["A Al", "B Bo", "A Cy"]);
    thanks.update({ ...base, foxThanksLurk: ["Z {user}"] });
    say(listeners, "!lurk", { viewerId: "v4", nickname: "Di" });
    expect(texts().at(-1)).toBe("Z Di");
  });

  it("n'écoute plus les messages après l'arrêt", () => {
    const { thanks, listeners, pushed } = started();
    thanks.stop();
    say(listeners, "!lurk");
    expect(pushed).toEqual([]);
  });
});

describe("un viewer très impliqué est remercié une fois, à 50 messages", () => {
  const started = (overrides: Partial<Settings> = {}) => {
    const harness = setup(overrides);
    harness.thanks.start();
    return harness;
  };
  const alice = (messages: number): Counted => ({ viewerId: "v1", nickname: "Alice", messages });

  it("remercie par un sourire d'1 s puis une phrase avec le pseudo et le nombre de messages, devant les messages, sans être coupé", () => {
    const { count, pushed, state } = started();
    count(alice(50));
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      kind: "thanks",
      text: "Alice a écrit 50 messages.",
      isCuttable: false,
      isUrgent: true,
    });
    expect(pushed[0]?.toShow()).toEqual(SMILE_MODE);
    expect(state.activity).toBe(1);
  });

  it("l'écrit au journal", () => {
    const { count, logs } = started();
    count(alice(50));
    expect(logs).toEqual(["Renard : remerciement (viewer très impliqué) : « Alice a écrit 50 messages. »"]);
  });

  it("ne remercie pas avant 50 messages", () => {
    const { count, pushed } = started();
    for (let messages = 1; messages < 50; messages += 1) count(alice(messages));
    expect(pushed).toEqual([]);
  });

  it("ne remercie un viewer qu'une fois : ni à 51, ni à 100", () => {
    const { count, texts } = started();
    count(alice(50));
    count(alice(51));
    count(alice(100));
    expect(texts()).toEqual(["Alice a écrit 50 messages."]);
  });

  it("remercie chaque viewer à son tour, sans classement ni mot sur les autres", () => {
    const { count, texts } = started();
    count({ viewerId: "v2", nickname: "Bob", messages: 50 });
    count(alice(50));
    count({ viewerId: "v2", nickname: "Bob", messages: 51 });
    expect(texts()).toEqual(["Bob a écrit 50 messages.", "Alice a écrit 50 messages."]);
  });

  it("dit le nombre de messages du viewer quand il dépasse déjà le seuil réglé", () => {
    const { count, texts } = started();
    count(alice(57));
    expect(texts()).toEqual(["Alice a écrit 57 messages."]);
  });

  it("suit le seuil changé en direct", () => {
    const { thanks, count, texts } = started();
    thanks.update({ ...base, foxTalkativeMessages: 20 });
    count(alice(20));
    expect(texts()).toEqual(["Alice a écrit 20 messages."]);
  });

  it("ne dit pas un pseudo refusé par le filtre d'insultes : « quelqu'un », et le dit au journal", () => {
    const { count, texts, logs } = started();
    count({ viewerId: "v3", nickname: "connard", messages: 50 });
    expect(texts()).toEqual(["quelqu'un a écrit 50 messages."]);
    expect(logs).toContain(
      "Renard : pseudo refusé par le filtre d'insultes (viewer très impliqué), il n'est pas dit.",
    );
  });

  it("ne remercie pas case décochée, et remercie au message suivant une fois la case recochée", () => {
    const { thanks, count, texts } = started({ foxShouldThank: false });
    count(alice(50));
    expect(texts()).toEqual([]);
    thanks.update({ ...base, foxShouldThank: true });
    count(alice(51));
    count(alice(52));
    expect(texts()).toEqual(["Alice a écrit 51 messages."]);
  });

  it("tire les phrases de la liste sans répéter avant d'avoir tout dit", () => {
    const { count, texts } = started({ foxThanksTalkative: ["A {user}", "B {user}"] });
    count({ viewerId: "v1", nickname: "Al", messages: 50 });
    count({ viewerId: "v2", nickname: "Bo", messages: 50 });
    count({ viewerId: "v3", nickname: "Cy", messages: 50 });
    expect(texts()).toEqual(["A Al", "B Bo", "A Cy"]);
  });

  it("n'écoute le compte qu'une fois démarré, et plus après l'arrêt", () => {
    const { thanks, tallyListeners, count, pushed } = setup();
    count(alice(50));
    expect(pushed).toEqual([]);
    thanks.start();
    thanks.start();
    expect(tallyListeners.size).toBe(1);
    thanks.stop();
    expect(tallyListeners.size).toBe(0);
    count(alice(50));
    expect(pushed).toEqual([]);
  });
});
