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

// Les subs, les subs offerts et les cheers arrivent par le tchat (IRC), sans jeton : ComfyJS les donne tels quels.
describe("createChatClient : les évènements du live", () => {
  const TIER = { prime: false, plan: "1000", planName: null };

  it("donne un sub sans message : le pseudo seul", () => {
    const { comfy, events } = setup();
    comfy.onSub("Alice", "", TIER, extra());
    expect(events).toEqual([{ kind: "live", event: { kind: "sub", user: "Alice", message: null } }]);
  });

  it("donne un sub avec son message, comme un message du tchat (viewer, emotes)", () => {
    const { comfy, events } = setup();
    comfy.onSub("Alice", "Merci Kappa", TIER, extra({ messageEmotes: { "25": ["6-10"] } }));
    expect(events).toEqual([
      {
        kind: "live",
        event: {
          kind: "sub",
          user: "Alice",
          message: {
            id: "msg-1",
            viewerId: "42",
            viewerLogin: "alice",
            nickname: "Alice",
            color: "#1E90FF",
            text: "Merci Kappa",
            emotes: [{ id: "25", start: 6, end: 10 }],
            isCommand: false,
          },
        },
      },
    ]);
  });

  it("donne un resub comme un sub, avec son message", () => {
    const { comfy, events } = setup();
    comfy.onResub("Alice", "Encore un mois !", 3, 7, TIER, extra({ messageEmotes: null }));
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.kind).toBe("live");
    expect(event?.kind === "live" ? event.event.kind : null).toBe("sub");
    expect(event?.kind === "live" && event.event.kind === "sub" ? event.event.message?.text : null).toBe(
      "Encore un mois !",
    );
  });

  it("donne un sub dont le message est illisible sans message : le sub est remercié quand même", () => {
    const { comfy, events } = setup();
    comfy.onSub("Alice", "Merci", TIER, null);
    expect(events).toEqual([{ kind: "live", event: { kind: "sub", user: "Alice", message: null } }]);
  });

  it("donne un sub offert à une personne : le donateur et celui qui reçoit", () => {
    const { comfy, events } = setup();
    comfy.onSubGift("Alice", 0, "Bob", 1, TIER, extra({ userState: { "msg-param-recipient-id": "7" } }));
    expect(events).toEqual([{ kind: "live", event: { kind: "gift", user: "Alice", recipient: "Bob" } }]);
  });

  it("ignore un sub offert qui fait partie d'une série : la série compte pour un seul évènement", () => {
    const { comfy, events } = setup();
    comfy.onSubGift(
      "Alice",
      0,
      "Bob",
      5,
      TIER,
      extra({ userState: { "msg-param-community-gift-id": "123456" } }),
    );
    expect(events).toEqual([]);
  });

  it("donne une série de subs offerts : le donateur et le nombre", () => {
    const { comfy, events } = setup();
    comfy.onSubMysteryGift("Alice", 5, 12, TIER, extra());
    expect(events).toEqual([{ kind: "live", event: { kind: "mystery-gift", user: "Alice", count: 5 } }]);
  });

  it("une série de 5 subs offerts donne un seul évènement, même avec ses 5 sub offerts qui suivent", () => {
    const { comfy, events } = setup();
    const series = extra({ userState: { "msg-param-community-gift-id": "123456" } });
    comfy.onSubMysteryGift("Alice", 5, 12, TIER, extra());
    for (const recipient of ["B1", "B2", "B3", "B4", "B5"]) {
      comfy.onSubGift("Alice", 0, recipient, 12, TIER, series);
    }
    expect(events).toEqual([{ kind: "live", event: { kind: "mystery-gift", user: "Alice", count: 5 } }]);
  });

  it("donne des bits : le pseudo, le nombre, et le message", () => {
    const { comfy, events } = setup();
    comfy.onCheer("Alice", "Cheer100 bravo", 100, {}, extra({ messageEmotes: null }));
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.kind === "live" && event.event.kind === "cheer" ? event.event.bits : null).toBe(100);
    expect(event?.kind === "live" && event.event.kind === "cheer" ? event.event.message?.text : null).toBe(
      "Cheer100 bravo",
    );
  });

  it("donne des bits sans message quand il n'y en a pas, ou qu'il est illisible", () => {
    const { comfy, events } = setup();
    comfy.onCheer("Alice", "", 100, {}, extra());
    comfy.onCheer("Bob", "Cheer50", 50, {}, undefined);
    expect(events).toEqual([
      { kind: "live", event: { kind: "cheer", user: "Alice", bits: 100, message: null } },
      { kind: "live", event: { kind: "cheer", user: "Bob", bits: 50, message: null } },
    ]);
  });

  it("marque comme commande le message d'un sub qui commence par « ! »", () => {
    const { comfy, events } = setup();
    comfy.onSub("Alice", "!lurk", TIER, extra());
    const event = events[0];
    expect(event?.kind === "live" && event.event.kind === "sub" ? event.event.message?.isCommand : null).toBe(
      true,
    );
  });
});
