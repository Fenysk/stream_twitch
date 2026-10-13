import { describe, expect, it } from "vitest";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
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

// Un serveur à la main : l'heure, la présence du renard, le silence de Fenysk, le tchat et les pas de 100 ms.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    presence: { kind: "away" as "visible" | "leaving" | "away" | "returning", elapsed: 200_000 },
    silentFor: Number.POSITIVE_INFINITY,
    tick: (): void => undefined,
    chat: (_event: ChatSourceEvent): void => undefined,
    subscribers: 0,
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
