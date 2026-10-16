import { describe, expect, it } from "vitest";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { Slot } from "../domain/timetable.rules";
import type { ChatSourceEvent } from "./chat.usecase";
import { createFoxJab } from "./fox-jab.usecase";
import type { QueueItem } from "./fox-queue.usecase";

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxJabAfter: 180_000,
  foxJabGap: 600_000,
  foxJabs: ["A", "B", "C"],
};

// Un serveur à la main : l'heure, la présence du renard, le silence de Fenysk (déjà entendu au départ), le tchat et les pas de 100 ms.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    presence: { kind: "away" as "visible" | "leaving" | "away" | "returning", elapsed: 200_000 },
    silentFor: 200_000,
    tick: (): void => undefined,
    chat: (_event: ChatSourceEvent): void => undefined,
    subscribers: 0,
    // Le prochain live d'Alexis dans sa timetable ; aucun au départ.
    slot: null as Slot | null,
  };
  const pushed: QueueItem[] = [];
  const logs: string[] = [];
  const jab = createFoxJab({
    chat: {
      subscribeSource(listener) {
        state.chat = listener;
        state.subscribers += 1;
        return () => {
          state.chat = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    queue: { push: (item) => pushed.push(item) },
    mode: {
      getVoice: () => ({ isTalking: false, talkingFor: 0, silentFor: state.silentFor }),
      subscribe(listener) {
        state.tick = listener;
        state.subscribers += 1;
        return () => {
          state.tick = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    fox: { getPresence: () => state.presence },
    timetable: { getNext: () => state.slot },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  jab.start();
  return { jab, state, pushed, logs };
};

describe("createFoxJab", () => {
  it("met une pique en file quand il est parti et que tout le monde se tait depuis assez longtemps", () => {
    const { state, pushed } = setup();
    state.now += 180_000;
    state.tick();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.kind).toBe("jab");
    expect(pushed[0]?.text).toBe("A");
    expect(pushed[0]?.isCuttable).toBe(true);
    expect(pushed[0]?.isUrgent).toBe(false);
    expect(pushed[0]?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("écrit au journal la pique qu'il va dire", () => {
    const { state, logs } = setup();
    state.now += 180_000;
    state.tick();
    expect(logs).toEqual(["Renard : il revient piquer Fenysk : « A »"]);
  });

  it("ne pique pas tant que le tchat a parlé il y a moins de 3 min", () => {
    const { state, pushed } = setup();
    state.now += 100_000;
    state.chat({
      kind: "message",
      message: {
        id: "1",
        viewerId: "v",
        viewerLogin: "v",
        nickname: "V",
        color: null,
        text: "salut",
        emotes: [],
        isCommand: false,
      },
    });
    state.now += 179_999;
    state.tick();
    expect(pushed).toEqual([]);
    state.now += 1;
    state.tick();
    expect(pushed).toHaveLength(1);
  });

  it("ne tient pas pour de la parole la suppression d'un message : seuls les messages comptent", () => {
    const { state, pushed } = setup();
    state.now += 100_000;
    state.chat({ kind: "message-deleted", messageId: "1" });
    state.now += 80_000;
    state.tick();
    expect(pushed).toHaveLength(1);
  });

  it("ne pique pas tant que Fenysk a parlé il y a moins de 3 min", () => {
    const { state, pushed } = setup();
    state.now += 180_000;
    state.silentFor = 179_999;
    state.tick();
    expect(pushed).toEqual([]);
  });

  it("attend la première parole de Fenysk depuis le démarrage : ni pique ni rappel avant, la pique 3 min après", () => {
    const { state, pushed } = setup({ ...settings, foxReminders: ["R1"] });
    state.silentFor = Number.POSITIVE_INFINITY;
    state.now += 1_800_000;
    state.tick();
    expect(pushed).toEqual([]);
    state.silentFor = 0;
    state.tick();
    state.now += 179_999;
    state.silentFor = 179_999;
    state.tick();
    expect(pushed).toEqual([]);
    state.now += 1;
    state.silentFor = 180_000;
    state.tick();
    expect(pushed.map(({ kind }) => kind)).toEqual(["jab"]);
  });

  it("attend aussi la première parole de Fenysk pour un rappel seul", () => {
    const { state, pushed } = setup({ ...settings, foxJabs: [], foxReminders: ["R1"] });
    state.silentFor = Number.POSITIVE_INFINITY;
    state.now += 1_800_000;
    state.tick();
    expect(pushed).toEqual([]);
    state.silentFor = 180_000;
    state.tick();
    expect(pushed.map(({ kind }) => kind)).toEqual(["reminder"]);
  });

  it("ne pique pas quand il est visible, en train de partir ou de revenir", () => {
    const { state, pushed } = setup();
    state.now += 400_000;
    for (const kind of ["visible", "leaving", "returning"] as const) {
      state.presence = { kind, elapsed: 400_000 };
      state.tick();
    }
    expect(pushed).toEqual([]);
  });

  it("ne repique pas avant l'écart de 10 min, et dit les piques dans l'ordre sans répéter", () => {
    const { state, pushed } = setup();
    state.now += 180_000;
    state.tick();
    state.now += 599_999;
    state.tick();
    expect(pushed).toHaveLength(1);
    state.now += 1;
    state.tick();
    state.now += 600_000;
    state.tick();
    state.now += 600_000;
    state.tick();
    expect(pushed.map(({ text }) => text)).toEqual(["A", "B", "C", "A"]);
  });

  it("n'attend pas son tour avant de piquer deux fois de suite sur le même tick : une pique par écart", () => {
    const { state, pushed } = setup();
    state.now += 180_000;
    state.tick();
    state.tick();
    state.tick();
    expect(pushed).toHaveLength(1);
  });

  it("suit les réglages changés en direct : un silence et un écart plus courts, une autre liste", () => {
    const { jab, state, pushed } = setup();
    jab.update({ ...settings, foxJabAfter: 30_000, foxJabGap: 60_000, foxJabs: ["Z"] });
    state.now += 30_000;
    state.tick();
    expect(pushed.map(({ text }) => text)).toEqual(["Z"]);
    state.now += 60_000;
    state.tick();
    expect(pushed.map(({ text }) => text)).toEqual(["Z", "Z"]);
  });

  it("ne pique pas avec une liste vide, ni sans les réglages du renard", () => {
    const empty = setup({ ...settings, foxJabs: [] });
    empty.state.now += 400_000;
    empty.state.tick();
    expect(empty.pushed).toEqual([]);
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.state.now += 400_000;
    none.state.tick();
    expect(none.pushed).toEqual([]);
  });

  it("repart de zéro quand quelque chose se passe dans le live (un remerciement)", () => {
    const { jab, state, pushed } = setup();
    state.now += 150_000;
    jab.noteActivity();
    state.now += 100_000;
    state.tick();
    expect(pushed).toEqual([]);
    state.now += 80_000;
    state.tick();
    expect(pushed).toHaveLength(1);
  });

  it("se désabonne à l'arrêt, et ne s'abonne pas deux fois au démarrage", () => {
    const { jab, state } = setup();
    jab.start();
    expect(state.subscribers).toBe(2);
    jab.stop();
    expect(state.subscribers).toBe(0);
  });
});

describe("createFoxJab : les rappels", () => {
  const withReminders: Settings = { ...settings, foxReminders: ["R1", "R2"] };
  const DAY = 86_400_000;

  // Dit `count` fois quelque chose dans le silence, une fois l'écart passé à chaque fois.
  const speakTimes = (harness: ReturnType<typeof setup>, count: number) => {
    harness.state.now += 180_000;
    harness.state.tick();
    for (let time = 1; time < count; time += 1) {
      harness.state.now += 600_000;
      harness.state.tick();
    }
  };

  it("alterne une pique et un rappel, en commençant par la pique, chaque liste sans répéter", () => {
    const harness = setup(withReminders);
    speakTimes(harness, 6);
    expect(harness.pushed.map(({ text }) => text)).toEqual(["A", "R1", "B", "R2", "C", "R1"]);
    expect(harness.pushed.map(({ kind }) => kind)).toEqual([
      "jab",
      "reminder",
      "jab",
      "reminder",
      "jab",
      "reminder",
    ]);
  });

  it("tourne le rappel vers le tchat : coupé si Fenysk parle, jamais devant les messages, sans retournement", () => {
    const harness = setup(withReminders);
    speakTimes(harness, 2);
    expect(harness.pushed[1]).toMatchObject({
      kind: "reminder",
      label: "rappel",
      text: "R1",
      isCuttable: true,
      isUrgent: false,
    });
    expect(harness.pushed[1]?.toShow()).toBeNull();
    expect(harness.pushed[0]?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("écrit le rappel au journal", () => {
    const harness = setup(withReminders);
    speakTimes(harness, 2);
    expect(harness.logs).toEqual([
      "Renard : il revient piquer Fenysk : « A »",
      "Renard : il revient faire un rappel au tchat : « R1 »",
    ]);
  });

  it("suit les mêmes règles que la pique : un seul des deux par écart de 10 min", () => {
    const harness = setup(withReminders);
    harness.state.now += 180_000;
    harness.state.tick();
    harness.state.now += 599_999;
    harness.state.tick();
    expect(harness.pushed).toHaveLength(1);
    harness.state.now += 1;
    harness.state.tick();
    expect(harness.pushed.map(({ text }) => text)).toEqual(["A", "R1"]);
  });

  it("garde la pique seule quand il n'y a aucun rappel ni aucun live à venir, comme avant", () => {
    const harness = setup();
    speakTimes(harness, 4);
    expect(harness.pushed.map(({ text }) => text)).toEqual(["A", "B", "C", "A"]);
  });

  it("dit les rappels seuls quand il n'y a aucune pique", () => {
    const harness = setup({ ...withReminders, foxJabs: [] });
    speakTimes(harness, 3);
    expect(harness.pushed.map(({ text }) => text)).toEqual(["R1", "R2", "R1"]);
  });

  it("ne dit rien sans pique, sans rappel et sans live à venir", () => {
    const harness = setup({ ...settings, foxJabs: [], foxReminders: [] });
    speakTimes(harness, 3);
    expect(harness.pushed).toEqual([]);
  });

  it("met le prochain live dans le tirage des rappels, avec son titre", () => {
    const harness = setup({ ...settings, foxReminders: ["R1"] });
    harness.state.slot = { start: harness.state.now + 2 * DAY, title: "Soirée jeux" };
    speakTimes(harness, 6);
    const reminders = harness.pushed.filter(({ kind }) => kind === "reminder").map(({ text }) => text);
    // Deux phrases au tirage : chacune une fois avant que la première reparte.
    expect(reminders).toHaveLength(3);
    expect(reminders[0]).toBe("R1");
    expect(reminders[2]).toBe("R1");
    const live = reminders[1];
    expect(live).toMatch(/^Prochain live : \p{L}+ à .+\. Au programme : Soirée jeux\.$/u);
  });

  it("dit le prochain live sans « Au programme » quand il n'a pas de titre", () => {
    const harness = setup({ ...settings, foxJabs: [], foxReminders: [] });
    harness.state.slot = { start: harness.state.now + 3 * DAY, title: null };
    speakTimes(harness, 1);
    expect(harness.pushed).toHaveLength(1);
    expect(harness.pushed[0]?.text).toMatch(/^Prochain live : .+ à .+\.$/);
    expect(harness.pushed[0]?.text).not.toContain("Au programme");
  });

  it("dit le prochain live seul, quand aucune liste n'a rien, puisqu'il entre dans le tirage", () => {
    const harness = setup({ ...settings, foxJabs: [], foxReminders: [] });
    harness.state.slot = { start: harness.state.now + DAY, title: null };
    speakTimes(harness, 2);
    expect(harness.pushed.map(({ kind }) => kind)).toEqual(["reminder", "reminder"]);
  });

  it("n'en dit pas un live qui n'est plus à venir : il sort du tirage", () => {
    const harness = setup({ ...settings, foxJabs: [], foxReminders: [] });
    harness.state.slot = null;
    speakTimes(harness, 2);
    expect(harness.pushed).toEqual([]);
  });

  it("suit les rappels changés en direct", () => {
    const harness = setup(withReminders);
    harness.jab.update({ ...withReminders, foxReminders: ["Z"] });
    speakTimes(harness, 2);
    expect(harness.pushed.map(({ text }) => text)).toEqual(["A", "Z"]);
  });
});

describe("createFoxJab : la récompense « Clasher Fenysk »", () => {
  const withIntros: Settings = {
    ...settings,
    foxReminders: ["R1"],
    foxClashIntros: ["{user} m'a payé pour te dire ça :", "{user} insiste :"],
  };

  it("met tout de suite en file une intro puis une pique, tournée vers Fenysk, coupée comme la pique, devant les messages", () => {
    const { jab, pushed } = setup(withIntros);
    jab.clash("Alice");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.text).toBe("Alice m'a payé pour te dire ça : A");
    expect(pushed[0]).toMatchObject({ kind: "jab", isCuttable: true, isUrgent: true });
    expect(pushed[0]?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("n'attend ni le silence ni l'absence du renard : visible, au milieu d'un échange, il pique quand même", () => {
    const { jab, state, pushed } = setup(withIntros);
    state.presence = { kind: "visible", elapsed: 0 };
    state.silentFor = 0;
    jab.clash("Alice");
    expect(pushed).toHaveLength(1);
  });

  it("tire la pique dans la liste de la relance, sans répéter : la relance reprend à la suivante", () => {
    const { jab, state, pushed } = setup(withIntros);
    jab.clash("Alice");
    state.now += 180_000;
    state.tick();
    expect(pushed.map(({ text }) => text.split(" ").at(-1))).toEqual(["A", "B"]);
  });

  it("ne compte pas dans l'écart de la relance : la relance pique à l'heure, et le clash ne l'attend pas", () => {
    const { jab, state, pushed } = setup(withIntros);
    state.now += 180_000;
    state.tick();
    expect(pushed).toHaveLength(1);
    jab.clash("Alice");
    jab.clash("Bob");
    expect(pushed).toHaveLength(3);
    // La relance suivante reste à 10 min de la sienne, et son alternance (pique puis rappel) n'a pas bougé.
    state.now += 599_999;
    state.tick();
    expect(pushed).toHaveLength(3);
    state.now += 1;
    state.tick();
    expect(pushed).toHaveLength(4);
    expect(pushed[3]?.kind).toBe("reminder");
  });

  it("dit l'intro de chaque clash sans répéter avant d'avoir tout dit, avec le pseudo", () => {
    const { jab, pushed } = setup(withIntros);
    jab.clash("Alice");
    jab.clash("Bob");
    jab.clash("Carl");
    expect(pushed.map(({ text }) => text)).toEqual([
      "Alice m'a payé pour te dire ça : A",
      "Bob insiste : B",
      "Carl m'a payé pour te dire ça : C",
    ]);
  });

  it("l'écrit au journal", () => {
    const { jab, logs } = setup(withIntros);
    jab.clash("Alice");
    expect(logs).toEqual([
      "Renard : récompense, il pique Fenysk tout de suite : « Alice m'a payé pour te dire ça : A »",
    ]);
  });

  it("compte pour de l'activité dans le live : le silence de la relance repart", () => {
    const { jab, state, pushed } = setup(withIntros);
    state.now += 150_000;
    jab.clash("Alice");
    pushed.length = 0;
    state.now += 100_000;
    state.tick();
    expect(pushed).toEqual([]);
    state.now += 80_000;
    state.tick();
    expect(pushed).toHaveLength(1);
  });

  it("ne dit rien, et le dit, sans pique ou sans intro", () => {
    const noJab = setup({ ...withIntros, foxJabs: [] });
    noJab.jab.clash("Alice");
    expect(noJab.pushed).toEqual([]);
    expect(noJab.logs).toEqual(["Renard : récompense, aucune pique à dire, rien n'est dit."]);
    const noIntro = setup({ ...withIntros, foxClashIntros: [] });
    noIntro.jab.clash("Alice");
    expect(noIntro.pushed).toEqual([]);
    expect(noIntro.logs).toEqual(["Renard : récompense, aucune phrase d'intro, rien n'est dit."]);
  });

  it("ne dit rien sans les réglages du renard", () => {
    const none = setup({ obsAddress: settings.obsAddress, micName: "x", threshold: -40, delay: 250 });
    none.jab.clash("Alice");
    expect(none.pushed).toEqual([]);
  });

  it("suit les intros et les piques changées en direct", () => {
    const { jab, pushed } = setup(withIntros);
    jab.update({ ...withIntros, foxJabs: ["Z"], foxClashIntros: ["{user} paie :"] });
    jab.clash("Alice");
    expect(pushed.map(({ text }) => text)).toEqual(["Alice paie : Z"]);
  });
});
