import ComfyJS from "comfy.js";
import { describe, expect, it, vi } from "vitest";
import type { ChatSourceEvent } from "../usecase/chat.usecase";
import { type ComfyEvents, type ComfySocket, createChatClient, createComfySocket } from "./chat.client";

// Un faux ComfyJS : il note ce qu'on lui demande, et les tests déclenchent ses évènements à la main.
const createFakeComfy = () => {
  const connections: string[] = [];
  const state = { disconnects: 0 };
  let events: ComfyEvents | undefined;
  const socket: ComfySocket = {
    listen(next) {
      events = next;
    },
    connect: (channel) => connections.push(channel),
    disconnect() {
      state.disconnects += 1;
    },
  };
  const getEvents = (): ComfyEvents => {
    if (!events) throw new Error("le client n'a pas écouté ComfyJS");
    return events;
  };
  return { socket, connections, state, getEvents };
};

const setup = () => {
  const fake = createFakeComfy();
  const messages: string[] = [];
  const events: ChatSourceEvent[] = [];
  const client = createChatClient(
    { channel: "fenysk", log: (message) => messages.push(message) },
    fake.socket,
  );
  client.start((event) => events.push(event));
  // La ligne écrite au démarrage est mise de côté : les tests lisent seulement ce qui suit.
  const started = messages.splice(0);
  return { ...fake, comfy: fake.getEvents(), client, messages, events, started };
};

const extra = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  userId: "42",
  username: "alice",
  displayName: "Alice",
  userColor: "#1E90FF",
  messageEmotes: { "25": ["6-10"] },
  ...overrides,
});

describe("createComfySocket", () => {
  it("rejoint la chaîne sans mot de passe : ni jeton, ni EventSub", () => {
    const init = vi.spyOn(ComfyJS, "Init").mockImplementation(() => undefined);
    createComfySocket().connect("fenysk");
    expect(init).toHaveBeenCalledWith("fenysk", undefined, ["fenysk"], false);
    init.mockRestore();
  });
});

describe("createChatClient : la connexion", () => {
  it("rejoint la chaîne une seule fois, et le dit dans le journal", () => {
    const { connections, client, started } = setup();
    client.start(() => undefined);
    expect(connections).toEqual(["fenysk"]);
    expect(started).toHaveLength(1);
    expect(started[0]).toContain("#fenysk");
  });

  it("se déconnecte à l'arrêt seulement s'il a démarré", () => {
    const { client, state } = setup();
    client.stop();
    expect(state.disconnects).toBe(1);
    const idle = createFakeComfy();
    createChatClient({ channel: "fenysk", log: () => undefined }, idle.socket).stop();
    expect(idle.state.disconnects).toBe(0);
  });

  it("écrit dans le journal la connexion, l'arrivée dans la chaîne, les reconnexions et les erreurs", () => {
    const { comfy, messages } = setup();
    comfy.onConnected("irc-ws.chat.twitch.tv", 443, true);
    comfy.onJoin("justinfan1", true, { channel: "fenysk" });
    comfy.onJoin("un_viewer", false, { channel: "fenysk" });
    comfy.onReconnect(2);
    comfy.onError(new Error("boum"));
    expect(messages).toHaveLength(4);
    expect(messages[0]).toContain("irc-ws.chat.twitch.tv");
    expect(messages[1]).toContain("#fenysk");
    expect(messages[2]).toContain("2");
    expect(messages[3]).toContain("boum");
  });
});

describe("createChatClient : les messages", () => {
  it("donne un message avec son nickname, sa couleur, son texte et ses emotes", () => {
    const { comfy, events } = setup();
    comfy.onChat("Alice", "Salut Kappa", {}, false, extra());
    expect(events).toEqual([
      {
        kind: "message",
        message: {
          id: "msg-1",
          viewerId: "42",
          viewerLogin: "alice",
          nickname: "Alice",
          color: "#1E90FF",
          text: "Salut Kappa",
          emotes: [{ id: "25", start: 6, end: 10 }],
          isCommand: false,
        },
      },
    ]);
  });

  it("donne une couleur nulle quand le viewer n'en a pas, et aucune emote quand il n'y en a pas", () => {
    const { comfy, events } = setup();
    comfy.onChat("Alice", "Salut", {}, false, extra({ userColor: null, messageEmotes: null }));
    comfy.onChat(
      "Alice",
      "Salut",
      {},
      false,
      extra({ id: "msg-2", userColor: "", messageEmotes: undefined }),
    );
    const colors = events.map((event) => (event.kind === "message" ? event.message.color : "?"));
    const emotes = events.map((event) => (event.kind === "message" ? event.message.emotes : "?"));
    expect(colors).toEqual([null, null]);
    expect(emotes).toEqual([[], []]);
  });

  it("lit toutes les positions de toutes les emotes, et laisse de côté une position illisible", () => {
    const { comfy, events } = setup();
    const messageEmotes = { "25": ["0-4", "6-10", "x-y"], "425618": ["12-14"] };
    comfy.onChat("Alice", "Kappa Kappa LUL", {}, false, extra({ messageEmotes }));
    const [event] = events;
    expect(event?.kind === "message" && event.message.emotes).toEqual([
      { id: "25", start: 0, end: 4 },
      { id: "25", start: 6, end: 10 },
      { id: "425618", start: 12, end: 14 },
    ]);
  });

  it("donne une commande comme un message dont le texte commence par « ! »", () => {
    const { comfy, events } = setup();
    comfy.onCommand("Alice", "lurk", "pour une heure", {}, extra({ messageEmotes: null }));
    comfy.onCommand("Alice", "discord", "", {}, extra({ id: "msg-2", messageEmotes: null }));
    const texts = events.map((event) => (event.kind === "message" ? event.message.text : "?"));
    expect(texts).toEqual(["!lurk pour une heure", "!discord"]);
    expect(events.every((event) => event.kind === "message" && event.message.isCommand)).toBe(true);
  });

  it("ignore un message illisible, et le dit dans le journal", () => {
    const { comfy, events, messages } = setup();
    comfy.onChat("Alice", "Salut", {}, false, extra({ id: undefined }));
    expect(events).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("illisible");
  });
});

describe("createChatClient : les suppressions", () => {
  it("donne le message qu'un modo a supprimé", () => {
    const { comfy, events } = setup();
    comfy.onMessageDeleted("msg-1", { id: "msg-1" });
    expect(events).toEqual([{ kind: "message-deleted", messageId: "msg-1" }]);
  });

  it("donne les messages d'un viewer banni, et d'un viewer mis en timeout, de la même façon", () => {
    const { comfy, events } = setup();
    comfy.onBan("alice", { roomId: "1", username: "alice", bannedUserId: "42" });
    comfy.onTimeout("bob", 600, { roomId: "1", username: "bob", timedOutUserId: "43" });
    expect(events).toEqual([
      { kind: "viewer-messages-deleted", viewerId: "42" },
      { kind: "viewer-messages-deleted", viewerId: "43" },
    ]);
  });

  it("ignore un ban sans identifiant de viewer, et le dit dans le journal", () => {
    const { comfy, events, messages } = setup();
    comfy.onBan("alice", { roomId: "1", username: "alice" });
    expect(events).toEqual([]);
    expect(messages).toHaveLength(1);
  });
});
