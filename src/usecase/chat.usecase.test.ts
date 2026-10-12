import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatMessage } from "../domain/chat.schema";
import type { RawMessage } from "../domain/chat.types";
import type { ChatSettings } from "../domain/chat-settings.rules";
import { CHAT_HISTORY_SIZE, type ChatSource, type ChatSourceEvent, createChat } from "./chat.usecase";

const raw = (overrides: Partial<RawMessage> = {}): RawMessage => ({
  id: "msg-1",
  viewerId: "42",
  viewerLogin: "alice",
  nickname: "Alice",
  color: "#1E90FF",
  text: "Salut Kappa",
  emotes: [{ id: "25", start: 6, end: 10 }],
  isCommand: false,
  ...overrides,
});

// Une fausse source : elle garde l'écouteur reçu, et les tests y déclenchent les évènements à la main.
const createFakeSource = () => {
  const state = { starts: 0, stops: 0 };
  let emit: (event: ChatSourceEvent) => void = () => undefined;
  const source: ChatSource = {
    start(listener) {
      state.starts += 1;
      emit = listener;
    },
    stop() {
      state.stops += 1;
    },
  };
  return { source, state, send: (event: ChatSourceEvent) => emit(event) };
};

const setup = (settings: ChatSettings = {}, clockAt = 5000) => {
  const fake = createFakeSource();
  const chat = createChat({ source: fake.source, settings, clock: () => clockAt });
  const events: ChatEvent[] = [];
  chat.feed.subscribe((event) => events.push(event));
  chat.start();
  const sendMessage = (overrides: Partial<RawMessage> = {}) =>
    fake.send({ kind: "message", message: raw(overrides) });
  return { chat, fake, events, sendMessage };
};

const snapshotMessages = (chat: ReturnType<typeof setup>["chat"]): ChatMessage[] => {
  const snapshot = chat.feed.getSnapshot();
  return snapshot.kind === "snapshot" ? snapshot.messages : [];
};

describe("createChat : la source", () => {
  it("démarre la source au démarrage, et l'arrête à l'arrêt", () => {
    const { chat, fake } = setup();
    expect(fake.state).toEqual({ starts: 1, stops: 0 });
    chat.stop();
    expect(fake.state).toEqual({ starts: 1, stops: 1 });
  });
});

describe("createChat : les messages", () => {
  it("publie un message découpé en fragments, daté de l'horloge", () => {
    const { events, sendMessage } = setup({}, 7000);
    sendMessage();
    expect(events).toEqual([
      {
        kind: "message",
        message: {
          id: "msg-1",
          nickname: "Alice",
          color: "#1E90FF",
          fragments: [
            { kind: "text", text: "Salut " },
            { kind: "emote", id: "25", name: "Kappa" },
          ],
          isHidden: false,
          receivedAt: 7000,
        },
      },
    ]);
  });

  it("masque une commande, et les messages d'un bot de la liste", () => {
    const { events, sendMessage } = setup({ chatBots: ["NightBot"] });
    sendMessage({ id: "a", text: "!lurk", emotes: [], isCommand: true });
    sendMessage({ id: "b", viewerLogin: "nightbot" });
    sendMessage({ id: "c" });
    expect(events.map((event) => (event.kind === "message" ? event.message.isHidden : null))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("donne l'historique et l'allure à qui se connecte", () => {
    const { chat, sendMessage } = setup({ chatStyle: "panel" });
    sendMessage({ id: "a" });
    sendMessage({ id: "b" });
    const snapshot = chat.feed.getSnapshot();
    expect(snapshot.kind).toBe("snapshot");
    if (snapshot.kind !== "snapshot") return;
    expect(snapshot.messages.map((message) => message.id)).toEqual(["a", "b"]);
    expect(snapshot.look.style).toBe("panel");
  });

  it("ne garde que les derniers messages dans l'historique", () => {
    const { chat, sendMessage } = setup();
    for (let count = 0; count < CHAT_HISTORY_SIZE + 3; count += 1) sendMessage({ id: `m${count}` });
    const ids = snapshotMessages(chat).map((message) => message.id);
    expect(ids).toHaveLength(CHAT_HISTORY_SIZE);
    expect(ids[0]).toBe("m3");
  });

  it("ne publie plus à qui s'est désabonné", () => {
    const { chat, sendMessage } = setup();
    const received: ChatEvent[] = [];
    const unsubscribe = chat.feed.subscribe((event) => received.push(event));
    sendMessage({ id: "a" });
    unsubscribe();
    sendMessage({ id: "b" });
    expect(received).toHaveLength(1);
  });
});

describe("createChat : les suppressions", () => {
  it("supprime le message qu'un modo a effacé : il sort de l'historique et des pages", () => {
    const { chat, fake, events, sendMessage } = setup();
    sendMessage({ id: "a" });
    sendMessage({ id: "b" });
    fake.send({ kind: "message-deleted", messageId: "a" });
    expect(events.at(-1)).toEqual({ kind: "delete", messageIds: ["a"] });
    expect(snapshotMessages(chat).map((message) => message.id)).toEqual(["b"]);
  });

  it("ne publie rien pour un message qu'il ne connaît pas", () => {
    const { fake, events, sendMessage } = setup();
    sendMessage({ id: "a" });
    fake.send({ kind: "message-deleted", messageId: "inconnu" });
    expect(events).toHaveLength(1);
  });

  it("supprime tous les messages d'un viewer banni ou mis en timeout, en une fois", () => {
    const { chat, fake, events, sendMessage } = setup();
    sendMessage({ id: "a", viewerId: "1" });
    sendMessage({ id: "b", viewerId: "2" });
    sendMessage({ id: "c", viewerId: "1" });
    fake.send({ kind: "viewer-messages-deleted", viewerId: "1" });
    expect(events.at(-1)).toEqual({ kind: "delete", messageIds: ["a", "c"] });
    expect(snapshotMessages(chat).map((message) => message.id)).toEqual(["b"]);
  });

  it("ne publie rien pour un viewer sans message", () => {
    const { fake, events, sendMessage } = setup();
    sendMessage({ id: "a", viewerId: "1" });
    fake.send({ kind: "viewer-messages-deleted", viewerId: "9" });
    expect(events).toHaveLength(1);
  });
});

describe("createChat : update", () => {
  it("publie la nouvelle allure quand un réglage change", () => {
    const { chat, events } = setup();
    chat.update({ chatOpacity: 40 });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.kind).toBe("look");
    if (event?.kind === "look") expect(event.look.opacity).toBe(40);
  });

  it("ne publie rien quand l'allure ne change pas", () => {
    const { chat, events } = setup({ chatOpacity: 40 });
    chat.update({ chatOpacity: 40 });
    expect(events).toEqual([]);
  });

  it("applique la liste des bots aux messages suivants", () => {
    const { chat, events, sendMessage } = setup();
    chat.update({ chatBots: ["alice"] });
    sendMessage();
    const message = events.find((event) => event.kind === "message");
    expect(message?.kind === "message" && message.message.isHidden).toBe(true);
  });
});
