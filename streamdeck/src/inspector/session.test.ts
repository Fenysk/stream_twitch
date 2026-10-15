import { afterEach, describe, expect, it, vi } from "vitest";
import { openSession, type SessionHandlers, type SocketLike } from "./session";

const REGISTRATION = {
  port: "28196",
  uuid: "ABCD",
  registerEvent: "registerPropertyInspector",
  actionInfo: JSON.stringify({
    action: "com.fenysk.stream-twitch.toggle",
    context: "ABCD",
    payload: { settings: { setting: "foxShouldThank" }, controller: "Keypad" },
  }),
};

class FakeSocket implements SocketLike {
  url = "";
  sent: unknown[] = [];
  isClosed = false;
  #open: () => void = () => undefined;
  #message: (text: string) => void = () => undefined;
  send = (text: string): void => {
    this.sent.push(JSON.parse(text));
  };
  close = (): void => {
    this.isClosed = true;
  };
  onOpen = (listener: () => void): void => {
    this.#open = listener;
  };
  onMessage = (listener: (text: string) => void): void => {
    this.#message = listener;
  };
  open = (): void => this.#open();
  receive = (message: unknown): void => this.#message(JSON.stringify(message));
  receiveRaw = (text: string): void => this.#message(text);
}

const start = (registration = REGISTRATION) => {
  const socket = new FakeSocket();
  const handlers = { onSettings: vi.fn(), onCatalogue: vi.fn() } satisfies SessionHandlers;
  const session = openSession(registration, handlers, (url) => {
    socket.url = url;
    return socket;
  });
  return { socket, handlers, session };
};

describe("openSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("se connecte au port de Stream Deck et s'enregistre avec l'identifiant du panneau", () => {
    const { socket } = start();
    socket.open();
    expect(socket.url).toBe("ws://127.0.0.1:28196");
    expect(socket.sent[0]).toEqual({ event: "registerPropertyInspector", uuid: "ABCD" });
  });

  it("rend l'action et les réglages de la touche à l'ouverture", () => {
    const { session } = start();
    expect(session?.action).toBe("com.fenysk.stream-twitch.toggle");
    expect(session?.settings).toEqual({ setting: "foxShouldThank" });
  });

  it("demande le catalogue au plugin dès l'ouverture, et à la demande", () => {
    const { socket, session } = start();
    socket.open();
    session?.requestCatalogue();
    const request = {
      action: "com.fenysk.stream-twitch.toggle",
      context: "ABCD",
      event: "sendToPlugin",
      payload: { type: "catalogue" },
    };
    expect(socket.sent).toEqual([{ event: "registerPropertyInspector", uuid: "ABCD" }, request, request]);
  });

  it("garde les réglages de la touche par setSettings", () => {
    const { socket, session } = start();
    session?.saveSettings({ setting: "foxShouldWelcome", name: "Habitués" });
    expect(socket.sent).toEqual([
      {
        action: "com.fenysk.stream-twitch.toggle",
        context: "ABCD",
        event: "setSettings",
        payload: { setting: "foxShouldWelcome", name: "Habitués" },
      },
    ]);
  });

  it("rend au panneau les réglages que Stream Deck lui renvoie", () => {
    const { socket, handlers } = start();
    socket.receive({ event: "didReceiveSettings", payload: { settings: { name: "Tchat" } } });
    expect(handlers.onSettings).toHaveBeenCalledWith({ name: "Tchat" });
  });

  it("rend au panneau le catalogue que le plugin répond, et ignore une réponse qui n'en est pas un", () => {
    const { socket, handlers } = start();
    socket.receive({ event: "sendToPropertyInspector", payload: { status: "down" } });
    expect(handlers.onCatalogue).toHaveBeenCalledWith({ status: "down" });
    socket.receive({ event: "sendToPropertyInspector", payload: { status: "perdu" } });
    expect(handlers.onCatalogue).toHaveBeenCalledTimes(1);
  });

  it("ignore un message qui n'est pas du JSON et un évènement qu'il ne lit pas", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { socket, handlers } = start();
    socket.receiveRaw("pas du JSON");
    socket.receive({ event: "didReceiveGlobalSettings", payload: { settings: {} } });
    expect(handlers.onSettings).not.toHaveBeenCalled();
    expect(handlers.onCatalogue).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("ferme la connexion quand on la ferme", () => {
    const { socket, session } = start();
    session?.close();
    expect(socket.isClosed).toBe(true);
  });

  it("n'ouvre rien quand les informations de la touche sont illisibles", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(start({ ...REGISTRATION, actionInfo: "pas du JSON" }).session).toBeUndefined();
    expect(start({ ...REGISTRATION, actionInfo: '{"action":"x"}' }).session).toBeUndefined();
  });
});
