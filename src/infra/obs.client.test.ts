import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createObsClient,
  isOwnPage,
  type ObsClientDeps,
  type ObsConnection,
  type ObsInputPeaks,
  type ObsPage,
  type ObsSocket,
} from "./obs.client";

const connected: ObsConnection = { ok: true, version: "5.7.4" };
const unreachable: ObsConnection = { ok: false, isPasswordRefused: false, reason: "ECONNREFUSED" };
const refused: ObsConnection = { ok: false, isPasswordRefused: true, reason: "Authentication failed." };

// Un faux OBS : les connexions suivent une liste (la dernière se répète), les évènements sont déclenchés à la main.
const createFakeSocket = (connections: ObsConnection[]) => {
  const queue = [...connections];
  const levelListeners: Array<(inputs: ObsInputPeaks[]) => void> = [];
  const exitListeners: Array<() => void> = [];
  const closedListeners: Array<() => void> = [];
  const state = { attempts: 0, pages: [] as ObsPage[], listError: undefined as Error | undefined };
  const refreshed: string[] = [];
  const socket: ObsSocket = {
    async connect() {
      state.attempts += 1;
      return (queue.length > 1 ? queue.shift() : queue[0]) ?? unreachable;
    },
    async listPages() {
      if (state.listError) throw state.listError;
      return state.pages;
    },
    async refreshPage(name) {
      refreshed.push(name);
    },
    onLevels: (listener) => levelListeners.push(listener),
    onExitStarted: (listener) => exitListeners.push(listener),
    onClosed: (listener) => closedListeners.push(listener),
  };
  return {
    socket,
    state,
    refreshed,
    sendLevels: (inputs: ObsInputPeaks[]) => {
      for (const listener of levelListeners) listener(inputs);
    },
    sendExitStarted: () => {
      for (const listener of exitListeners) listener();
    },
    sendClosed: () => {
      for (const listener of closedListeners) listener();
    },
  };
};

const setup = (connections: ObsConnection[]) => {
  const fake = createFakeSocket(connections);
  const messages: string[] = [];
  const exits: string[] = [];
  const deps: ObsClientDeps = {
    address: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    pageHosts: ["localhost:4747", "127.0.0.1:4747"],
    log: (message) => messages.push(message),
    onExit: (reason) => exits.push(reason),
  };
  const client = createObsClient(deps, fake.socket);
  client.start();
  return { fake, client, messages, exits };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isOwnPage", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("reconnaît les adresses du serveur", () => {
    expect(isOwnPage("http://localhost:4747/head", hosts)).toBe(true);
    expect(isOwnPage("http://127.0.0.1:4747/head", hosts)).toBe(true);
  });

  it("refuse un autre port, un autre site, une adresse absente ou illisible", () => {
    expect(isOwnPage("http://localhost:3000/head", hosts)).toBe(false);
    expect(isOwnPage("http://localhost:47470/head", hosts)).toBe(false);
    expect(isOwnPage("https://www.twitch.tv/", hosts)).toBe(false);
    expect(isOwnPage(undefined, hosts)).toBe(false);
    expect(isOwnPage("pas une adresse", hosts)).toBe(false);
  });
});

describe("createObsClient : connexion", () => {
  it("réessaie toutes les 2 s sans limite avant la première connexion, et le dit une seule fois", async () => {
    const { fake, messages, exits } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.state.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(2000 * 20);
    expect(fake.state.attempts).toBe(21);
    expect(messages.filter((message) => message.includes("OBS ne répond pas"))).toHaveLength(1);
    expect(exits).toEqual([]);
  });

  it("annonce la connexion et l'abonnement au niveau du micro", async () => {
    const { messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(messages).toContain("Connecté à OBS ws://127.0.0.1:4455 (obs-websocket 5.7.4).");
    expect(messages.some((message) => message.startsWith("Abonné au niveau du micro « Mic/Aux »"))).toBe(
      true,
    );
  });

  it("signale un mot de passe refusé une seule fois, sans jamais l'écrire, et continue d'essayer", async () => {
    const { fake, messages } = setup([refused]);
    await vi.advanceTimersByTimeAsync(2000 * 5);
    expect(fake.state.attempts).toBe(6);
    const refusals = messages.filter((message) => message.includes("Mot de passe OBS refusé, voir .env"));
    expect(refusals).toHaveLength(1);
    expect(messages.join("\n")).not.toContain("Authentication failed.");
  });

  it("reprend les essais après un mot de passe refusé puis se connecte", async () => {
    const { messages } = setup([refused, unreachable, connected]);
    await vi.advanceTimersByTimeAsync(2000 * 3);
    expect(messages.some((message) => message.startsWith("Connecté à OBS"))).toBe(true);
  });
});

describe("createObsClient : sources navigateur", () => {
  it("rafraîchit seulement les sources dont l'URL pointe vers le serveur", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.pages = [
      { name: "Tête", url: "http://localhost:4747/head" },
      { name: "Chat", url: "https://www.twitch.tv/popout/fenysk/chat" },
      { name: "Ailleurs", url: "http://localhost:3000/" },
      { name: "Fichier local", url: undefined },
      { name: "Tête (copie)", url: "http://127.0.0.1:4747/head" },
    ];
    const messages: string[] = [];
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: ["localhost:4747", "127.0.0.1:4747"],
        log: (m) => messages.push(m),
        onExit: () => undefined,
      },
      fake.socket,
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.refreshed).toEqual(["Tête", "Tête (copie)"]);
    expect(messages).toContain("Source navigateur « Tête » rafraîchie.");
  });

  it("journalise l'échec du rafraîchissement avec son contexte, sans arrêter le client", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.listError = new Error("RequestFailed");
    const messages: string[] = [];
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: ["localhost:4747"],
        log: (m) => messages.push(m),
        onExit: () => undefined,
      },
      fake.socket,
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(messages).toContain("Rafraîchissement des sources navigateur impossible : RequestFailed");
    expect(messages.some((message) => message.startsWith("Connecté à OBS"))).toBe(true);
  });
});

describe("createObsClient : niveau du micro", () => {
  it("transmet en dB le pic le plus fort de l'entrée du micro, et ignore les autres entrées", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    fake.sendLevels([
      { name: "Audio du bureau", peaks: [1, 1] },
      { name: "Mic/Aux", peaks: [0.01, 0.1] },
    ]);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeCloseTo(-20, 6);
  });

  it("ne transmet plus rien à un abonné qui s'est désabonné", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    const unsubscribe = client.mic.subscribe((level) => levels.push(level));
    unsubscribe();
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.5] }]);
    expect(levels).toEqual([]);
  });

  it("avertit une fois, avec les noms reçus, si l'entrée du micro n'apparaît pas en 5 s", async () => {
    const { fake, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.2] }]);
    await vi.advanceTimersByTimeAsync(4999);
    expect(messages.some((message) => message.startsWith("Attention"))).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(20_000);
    const warnings = messages.filter((message) => message.startsWith("Attention"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("« Mic/Aux »");
    expect(warnings[0]).toContain("« Audio du bureau »");
  });

  it("n'avertit pas quand l'entrée du micro apparaît dans les 5 s", async () => {
    const { fake, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.2] }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(messages.some((message) => message.startsWith("Attention"))).toBe(false);
    expect(messages).toContain("Niveau du micro « Mic/Aux » reçu.");
  });
});

describe("createObsClient : arrêt du serveur", () => {
  it("s'arrête quand OBS annonce qu'il se ferme", async () => {
    const { fake, exits } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendExitStarted();
    expect(exits).toEqual(["OBS se ferme : arrêt du serveur."]);
  });

  it("s'arrête quand la connexion tombe et ne revient pas en 30 s", async () => {
    const { fake, exits } = setup([connected, unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendClosed();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(exits).toEqual(["OBS ne revient pas depuis 30 s : arrêt du serveur."]);
  });

  it("ne s'arrête pas quand la connexion revient avant 30 s", async () => {
    const { fake, exits, messages } = setup([connected, unreachable, unreachable, connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendClosed();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(messages.filter((message) => message.startsWith("Connecté à OBS"))).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exits).toEqual([]);
  });

  it("ne confond pas la fermeture d'un essai raté avec une connexion perdue", async () => {
    const { fake, exits } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendClosed();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(exits).toEqual([]);
  });
});
