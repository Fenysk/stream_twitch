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
  const streamListeners: Array<(isLive: boolean) => void> = [];
  const muteListeners: Array<(name: string, isMuted: boolean) => void> = [];
  const state = {
    attempts: 0,
    pages: [] as ObsPage[],
    listError: undefined as Error | undefined,
    stream: { isLive: false, durationMs: 0 },
    streamError: undefined as Error | undefined,
    // Les entrées coupées dans OBS ; `muteError` : OBS refuse de dire (entrée inconnue).
    muted: new Set<string>(),
    muteError: undefined as Error | undefined,
  };
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
    async getInputMute(name) {
      if (state.muteError) throw state.muteError;
      return state.muted.has(name);
    },
    onInputMute: (listener) => muteListeners.push(listener),
    async getStreamStatus() {
      if (state.streamError) throw state.streamError;
      return state.stream;
    },
    onStreamState: (listener) => streamListeners.push(listener),
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
    sendStreamState: (isLive: boolean) => {
      for (const listener of streamListeners) listener(isLive);
    },
    sendInputMute: (name: string, isMuted: boolean) => {
      for (const listener of muteListeners) listener(name, isMuted);
    },
    sendExitStarted: () => {
      for (const listener of exitListeners) listener();
    },
    sendClosed: () => {
      for (const listener of closedListeners) listener();
    },
  };
};

const setup = (connections: ObsConnection[], overrides: Partial<ObsClientDeps> = {}) => {
  const fake = createFakeSocket(connections);
  const messages: string[] = [];
  const exits: string[] = [];
  const deps: ObsClientDeps = {
    address: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    pageHosts: ["localhost:4747", "127.0.0.1:4747"],
    log: (message) => messages.push(message),
    onExit: (reason) => exits.push(reason),
    ...overrides,
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

describe("createObsClient : un serveur d'essai sur un autre port", () => {
  it("ne rafraîchit pas la source du stream, qui pointe vers le port 4747", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.pages = [
      { name: "SouthPark", url: "http://localhost:4747/head" },
      { name: "Copie locale", url: "http://127.0.0.1:4747/head" },
      { name: "Essai", url: "http://localhost:4748/head" },
    ];
    const messages: string[] = [];
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: ["localhost:4748", "127.0.0.1:4748"],
        log: (message) => messages.push(message),
        onExit: () => undefined,
      },
      fake.socket,
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.refreshed).toEqual(["Essai"]);
    expect(messages.some((message) => message.includes("SouthPark"))).toBe(false);
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

describe("createObsClient : niveau du son du PC", () => {
  const withDesktop = { desktopName: "Audio du bureau" };

  it("transmet en dB le pic le plus fort de la source du son du PC, sans toucher au mic", async () => {
    const { fake, client } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    const mic: number[] = [];
    const desktop: number[] = [];
    client.mic.subscribe((level) => mic.push(level));
    client.desktop.subscribe((level) => desktop.push(level));
    fake.sendLevels([
      { name: "Mic/Aux", peaks: [0.5, 1] },
      { name: "Audio du bureau", peaks: [0.1, 0.05] },
      { name: "Tête", peaks: [1] },
    ]);
    expect(mic).toHaveLength(1);
    expect(mic[0]).toBeCloseTo(0, 6);
    expect(desktop).toHaveLength(1);
    expect(desktop[0]).toBeCloseTo(-20, 6);
  });

  it("ne transmet plus rien à un abonné qui s'est désabonné", async () => {
    const { fake, client } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    const unsubscribe = client.desktop.subscribe((level) => levels.push(level));
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    unsubscribe();
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    expect(levels).toHaveLength(1);
  });

  it("annonce l'abonnement et le premier niveau reçu", async () => {
    const { fake, messages } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      messages.some((message) => message.startsWith("Abonné au niveau du son du PC « Audio du bureau »")),
    ).toBe(true);
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    expect(messages).toContain("Niveau du son du PC « Audio du bureau » reçu.");
  });

  it("avertit une fois, avec les noms reçus, si la source du son du PC n'apparaît pas en 5 s", async () => {
    const { fake, messages } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.2] }]);
    await vi.advanceTimersByTimeAsync(20_000);
    const warnings = messages.filter((message) => message.startsWith("Attention"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("« Audio du bureau »");
    expect(warnings[0]).toContain("« Mic/Aux »");
    expect(warnings[0]).toContain("Vérifier l'entrée du son du PC");
  });

  it("ne suit rien, et n'avertit de rien, sans nom de source", async () => {
    const { fake, client, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.desktop.subscribe((level) => levels.push(level));
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(levels).toEqual([]);
    expect(messages.some((message) => message.includes("son du PC"))).toBe(false);
    expect(messages.filter((message) => message.startsWith("Attention"))).toHaveLength(1);
  });

  it("change de source en direct, le dit dans le journal, et l'efface avec undefined", async () => {
    const { fake, client, messages } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.desktop.subscribe((level) => levels.push(level));
    client.updateDesktopName("Musique");
    fake.sendLevels([
      { name: "Audio du bureau", peaks: [1] },
      { name: "Musique", peaks: [0.1] },
    ]);
    expect(levels).toHaveLength(1);
    expect(messages).toContain("Entrée du son du PC changée : « Musique ».");
    client.updateDesktopName(undefined);
    fake.sendLevels([{ name: "Musique", peaks: [0.1] }]);
    expect(levels).toHaveLength(1);
  });
});

describe("createObsClient : une entrée coupée dans OBS", () => {
  const withDesktop = { desktopName: "Audio du bureau" };

  it("rend le level plancher (-100 dB) tant que le mic est coupé, même si OBS envoie encore des pics", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    fake.sendInputMute("Mic/Aux", true);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.5, 1] }]);
    expect(levels).toEqual([-100]);
  });

  it("reprend les pics du mic dès qu'il est rouvert", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    fake.sendInputMute("Mic/Aux", true);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [1] }]);
    fake.sendInputMute("Mic/Aux", false);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.1] }]);
    expect(levels[0]).toBe(-100);
    expect(levels[1]).toBeCloseTo(-20, 6);
  });

  it("lit la coupure à la connexion : un mic déjà coupé quand le serveur démarre est muet", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.muted.add("Mic/Aux");
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: [],
        log: () => undefined,
        onExit: () => undefined,
      },
      fake.socket,
    );
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [1] }]);
    expect(levels).toEqual([-100]);
  });

  it("ne coupe que l'entrée annoncée : le desktop garde ses pics quand le mic est coupé, et inversement", async () => {
    const { fake, client } = setup([connected], withDesktop);
    await vi.advanceTimersByTimeAsync(0);
    const mic: number[] = [];
    const desktop: number[] = [];
    client.mic.subscribe((level) => mic.push(level));
    client.desktop.subscribe((level) => desktop.push(level));
    fake.sendInputMute("Mic/Aux", true);
    fake.sendInputMute("Tête", true);
    fake.sendLevels([
      { name: "Mic/Aux", peaks: [1] },
      { name: "Audio du bureau", peaks: [0.1] },
    ]);
    expect(mic).toEqual([-100]);
    expect(desktop[0]).toBeCloseTo(-20, 6);
    fake.sendInputMute("Audio du bureau", true);
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    expect(desktop[1]).toBe(-100);
  });

  it("garde ses pics quand OBS refuse de dire si l'entrée est coupée", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.muteError = new Error("ResourceNotFound");
    const messages: string[] = [];
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: [],
        log: (message) => messages.push(message),
        onExit: () => undefined,
      },
      fake.socket,
    );
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.1] }]);
    expect(levels[0]).toBeCloseTo(-20, 6);
    expect(messages.some((message) => message.startsWith("Connecté à OBS"))).toBe(true);
  });

  it("dit dans le journal quand le mic est coupé puis rouvert, une fois par changement", async () => {
    const { fake, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendInputMute("Mic/Aux", true);
    fake.sendInputMute("Mic/Aux", true);
    fake.sendInputMute("Mic/Aux", false);
    expect(messages.filter((message) => message.includes("coupée dans OBS"))).toHaveLength(1);
    expect(messages.filter((message) => message.includes("rouverte dans OBS"))).toHaveLength(1);
  });

  it("relit la coupure de la nouvelle entrée quand le mic change en direct", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.state.muted.add("Autre mic");
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    fake.sendInputMute("Mic/Aux", true);
    client.updateMicName("Autre mic");
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Autre mic", peaks: [1] }]);
    client.updateMicName("Mic/Aux");
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [1] }]);
    expect(levels).toEqual([-100, 0]);
  });
});

describe("createObsClient : la diffusion", () => {
  it("dit en quel état est la diffusion dès la connexion, même en plein live", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.stream = { isLive: true, durationMs: 9_000_000 };
    const client = createObsClient(
      {
        address: "ws://127.0.0.1:4455",
        micName: "Mic/Aux",
        pageHosts: [],
        log: () => undefined,
        onExit: () => undefined,
      },
      fake.socket,
    );
    const seen: Array<{ isLive: boolean; duration: number }> = [];
    client.broadcast.subscribe((broadcast) => seen.push(broadcast));
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([{ isLive: true, duration: 9_000_000 }]);
  });

  it("dit aussi que la diffusion n'est pas lancée, quand OBS n'émet pas", async () => {
    const { client } = setup([connected]);
    const seen: Array<{ isLive: boolean; duration: number }> = [];
    client.broadcast.subscribe((broadcast) => seen.push(broadcast));
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen).toEqual([{ isLive: false, duration: 0 }]);
  });

  it("annonce le démarrage à zéro et l'arrêt de la diffusion", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const seen: Array<{ isLive: boolean; duration: number }> = [];
    client.broadcast.subscribe((broadcast) => seen.push(broadcast));
    fake.sendStreamState(true);
    fake.sendStreamState(false);
    expect(seen).toEqual([
      { isLive: true, duration: 0 },
      { isLive: false, duration: 0 },
    ]);
  });

  it("ne transmet plus rien à un abonné qui s'est désabonné", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const received: Array<{ isLive: boolean; duration: number }> = [];
    const unsubscribe = client.broadcast.subscribe((broadcast) => received.push(broadcast));
    fake.sendStreamState(true);
    unsubscribe();
    fake.sendStreamState(false);
    expect(received).toEqual([{ isLive: true, duration: 0 }]);
  });

  it("lit de nouveau l'état à chaque reconnexion", async () => {
    const { fake, client } = setup([connected, unreachable, connected]);
    await vi.advanceTimersByTimeAsync(0);
    const seen: Array<{ isLive: boolean; duration: number }> = [];
    client.broadcast.subscribe((broadcast) => seen.push(broadcast));
    fake.state.stream = { isLive: true, durationMs: 60_000 };
    fake.sendClosed();
    await vi.advanceTimersByTimeAsync(4000);
    expect(seen).toEqual([{ isLive: true, duration: 60_000 }]);
  });

  it("journalise l'état illisible d'OBS avec son contexte, sans arrêter le client", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.streamError = new Error("réponse inattendue");
    const messages: string[] = [];
    const client = createObsClient(
      {
        address: "ws://127.0.0.1:4455",
        micName: "Mic/Aux",
        pageHosts: [],
        log: (message) => messages.push(message),
        onExit: () => undefined,
      },
      fake.socket,
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(messages).toContain("Diffusion : état d'OBS illisible, réponse inattendue");
    expect(client.getStatus().isLinked).toBe(true);
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

describe("createObsClient : micro changé en direct", () => {
  it("transmet le niveau de la nouvelle entrée, et plus celui de l'ancienne", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const levels: number[] = [];
    client.mic.subscribe((level) => levels.push(level));
    client.updateMicName("Audio du bureau");
    fake.sendLevels([
      { name: "Mic/Aux", peaks: [1] },
      { name: "Audio du bureau", peaks: [0.1] },
    ]);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeCloseTo(-20, 6);
  });

  it("le dit dans le journal, et annonce le niveau de la nouvelle entrée dès qu'il arrive", async () => {
    const { fake, client, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    client.updateMicName("Audio du bureau");
    fake.sendLevels([{ name: "Audio du bureau", peaks: [0.1] }]);
    expect(messages).toContain("Entrée du micro changée : « Audio du bureau ».");
    expect(messages).toContain("Niveau du micro « Audio du bureau » reçu.");
  });

  it("avertit de nouveau, avec les noms reçus, si la nouvelle entrée n'apparaît pas en 5 s", async () => {
    const { fake, client, messages } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.2] }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(messages.some((message) => message.startsWith("Attention"))).toBe(false);
    client.updateMicName("Inconnue");
    await vi.advanceTimersByTimeAsync(5000);
    const warnings = messages.filter((message) => message.startsWith("Attention"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("« Inconnue »");
    expect(warnings[0]).toContain("« Mic/Aux »");
  });

  it("garde le nouveau nom pour la reconnexion : rien n'est armé tant que OBS n'est pas là", async () => {
    const { fake, client, messages } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    client.updateMicName("Audio du bureau");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(messages.some((message) => message.startsWith("Attention"))).toBe(false);
    expect(fake.state.attempts).toBeGreaterThan(1);
  });
});

describe("createObsClient : état", () => {
  it("dit si OBS est joint, et quelles entrées audio sont passées", async () => {
    const { fake, client } = setup([unreachable, connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getStatus()).toEqual({ isLinked: false, inputNames: [] });
    await vi.advanceTimersByTimeAsync(2000);
    fake.sendLevels([
      { name: "Mic/Aux", peaks: [0.1] },
      { name: "Audio du bureau", peaks: [0.1] },
    ]);
    expect(client.getStatus()).toEqual({ isLinked: true, inputNames: ["Audio du bureau", "Mic/Aux"] });
  });

  it("dit que OBS n'est plus joint quand la connexion tombe", async () => {
    const { fake, client } = setup([connected, unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendClosed();
    expect(client.getStatus().isLinked).toBe(false);
  });
});
