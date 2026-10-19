import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PictureItem } from "../domain/picture.rules";
import {
  createObsClient,
  isOwnPage,
  isServedPage,
  isShowPage,
  type ObsClientDeps,
  type ObsConnection,
  type ObsFilter,
  type ObsInputPeaks,
  type ObsPage,
  type ObsSceneItem,
  type ObsSocket,
  toCameraPages,
  toCameraSources,
  toSceneNames,
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
  const replayListeners: Array<(path: string) => void> = [];
  const sceneListeners: Array<() => void> = [];
  const state = {
    attempts: 0,
    pages: [] as ObsPage[],
    listError: undefined as Error | undefined,
    // La scène du programme, et ce que contient chaque scène ou groupe (par son nom) ; `sceneError` : OBS refuse de répondre.
    programScene: "jeu",
    scenes: {} as Record<string, ObsSceneItem[]>,
    sceneError: undefined as Error | undefined,
    // La place caméra : les éléments de chaque scène telle que GetSceneItemList les rend (par nom de scène), les demandes de visibilité
    // reçues (scène, élément, visible) ; `pictureError` : OBS refuse de lire la place, `visibilityError` : OBS refuse de changer un élément.
    places: {} as Record<string, PictureItem[]>,
    pictureError: undefined as Error | undefined,
    visibility: [] as string[],
    visibilityError: undefined as Error | undefined,
    // Les filtres de chaque source (par nom de source), les demandes de filtre reçues dans l'ordre (« créé », « réglé »), et `filterError` :
    // OBS refuse de répondre (source inconnue).
    filters: {} as Record<string, ObsFilter[]>,
    filterCalls: [] as string[],
    filterError: undefined as Error | undefined,
    // Les noms des scènes qu'OBS liste, les scènes où le programme est passé, et `switchError` : OBS refuse de changer de scène.
    sceneNames: [] as string[],
    switched: [] as string[],
    switchError: undefined as Error | undefined,
    queried: [] as string[],
    stream: { isLive: false, durationMs: 0 },
    streamError: undefined as Error | undefined,
    // Les demandes d'arrêt du live, et `stopError` : OBS refuse de l'arrêter.
    stops: 0,
    stopError: undefined as Error | undefined,
    // Les captures demandées (source:largeur), ce qu'OBS rend (son data URI), et `screenshotError` : OBS refuse de capturer.
    screenshots: [] as string[],
    screenshot: "data:image/jpg;base64,/9j/4A==",
    screenshotError: undefined as Error | undefined,
    // Les entrées coupées dans OBS ; `muteError` : OBS refuse de dire (entrée inconnue).
    muted: new Set<string>(),
    muteError: undefined as Error | undefined,
    // Les entrées que le client a demandé de couper ou de rouvrir, dans l'ordre ; `muteUpdateError` : OBS refuse de les changer.
    muteUpdates: [] as string[],
    muteUpdateError: undefined as Error | undefined,
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
    async getProgramScene() {
      if (state.sceneError) throw state.sceneError;
      return state.programScene;
    },
    async listScenes() {
      if (state.sceneError) throw state.sceneError;
      return state.sceneNames;
    },
    async updateProgramScene(name) {
      if (state.switchError) throw state.switchError;
      state.switched.push(name);
    },
    async listSceneItems(sceneName) {
      if (state.sceneError) throw state.sceneError;
      state.queried.push(sceneName);
      return state.scenes[sceneName] ?? [];
    },
    async listPictureItems(sceneName) {
      if (state.pictureError) throw state.pictureError;
      const items = state.places[sceneName];
      if (!items) throw new Error(`No source was found by the name of \`${sceneName}\`.`);
      return items;
    },
    async updateSceneItemEnabled(sceneName, itemId, isEnabled) {
      if (state.visibilityError) throw state.visibilityError;
      state.visibility.push(`${sceneName}:${itemId}:${isEnabled ? "visible" : "caché"}`);
      // Comme OBS : l'élément change, puis l'évènement part.
      const item = state.places[sceneName]?.find(({ id }) => id === itemId);
      if (item) item.isEnabled = isEnabled;
    },
    async listFilters(sourceName) {
      if (state.filterError) throw state.filterError;
      return state.filters[sourceName] ?? [];
    },
    async createFilter(sourceName, filterName, filterKind, filterSettings) {
      if (state.filterError) throw state.filterError;
      state.filterCalls.push(
        `${sourceName}:créé:${filterName}:${filterKind}:${JSON.stringify(filterSettings)}`,
      );
      // Comme OBS : le filtre s'ajoute à la fin de ceux de la source.
      state.filters[sourceName] = [
        ...(state.filters[sourceName] ?? []),
        { name: filterName, kind: filterKind, settings: filterSettings },
      ];
    },
    async updateFilterSettings(sourceName, filterName, filterSettings) {
      if (state.filterError) throw state.filterError;
      state.filterCalls.push(`${sourceName}:réglé:${filterName}:${JSON.stringify(filterSettings)}`);
      const filter = state.filters[sourceName]?.find(({ name }) => name === filterName);
      if (filter) filter.settings = { ...filter.settings, ...filterSettings };
    },
    onSceneChanged: (listener) => sceneListeners.push(listener),
    async getInputMute(name) {
      if (state.muteError) throw state.muteError;
      return state.muted.has(name);
    },
    onInputMute: (listener) => muteListeners.push(listener),
    async updateInputMute(name, isMuted) {
      if (state.muteUpdateError) throw state.muteUpdateError;
      state.muteUpdates.push(`${name}:${isMuted ? "coupé" : "ouvert"}`);
    },
    async getStreamStatus() {
      if (state.streamError) throw state.streamError;
      return state.stream;
    },
    async stopStream() {
      if (state.stopError) throw state.stopError;
      state.stops += 1;
    },
    async getSourceScreenshot(sourceName, width) {
      if (state.screenshotError) throw state.screenshotError;
      state.screenshots.push(`${sourceName}:${width}`);
      return state.screenshot;
    },
    onStreamState: (listener) => streamListeners.push(listener),
    onReplaySaved: (listener) => replayListeners.push(listener),
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
    sendReplaySaved: (path: string) => {
      for (const listener of replayListeners) listener(path);
    },
    sendSceneChanged: () => {
      for (const listener of sceneListeners) listener();
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

describe("isServedPage", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("reconnaît les pages du serveur et celles de ses sous-domaines sur le même port : caméras, décompte", () => {
    expect(isServedPage("http://localhost:4747/head", hosts)).toBe(true);
    expect(isServedPage("http://127.0.0.1:4747/show", hosts)).toBe(true);
    expect(isServedPage("http://camera-3.localhost:4747/camera/3", hosts)).toBe(true);
    expect(isServedPage("http://countdown.localhost:4747/countdown", hosts)).toBe(true);
  });

  it("refuse un autre port, un autre site, un hôte qui ne fait que finir pareil, une adresse absente ou illisible", () => {
    expect(isServedPage("http://camera-1.localhost:4748/camera/1", hosts)).toBe(false);
    expect(isServedPage("http://localhost:3000/head", hosts)).toBe(false);
    expect(isServedPage("http://camera-1.example.com:4747/camera/1", hosts)).toBe(false);
    expect(isServedPage("http://notlocalhost:4747/head", hosts)).toBe(false);
    expect(isServedPage("http://camera-1.localhost/camera/1", hosts)).toBe(false);
    expect(isServedPage("https://www.twitch.tv/", hosts)).toBe(false);
    expect(isServedPage(undefined, hosts)).toBe(false);
    expect(isServedPage("pas une adresse", hosts)).toBe(false);
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

  it("rafraîchit aussi les pages des caméras et le décompte, qui ont leur propre hôte sur le port du serveur", async () => {
    const fake = createFakeSocket([connected]);
    fake.state.pages = [
      { name: "Tête", url: "http://localhost:4747/head" },
      { name: "Caméra du salon", url: "http://camera-1.localhost:4747/camera/1" },
      { name: "Caméra de la cuisine", url: "http://camera-12.localhost:4747/camera/12" },
      { name: "Décompte", url: "http://countdown.localhost:4747/countdown" },
      { name: "Caméra d'essai", url: "http://camera-1.localhost:4748/camera/1" },
      { name: "Décompte d'essai", url: "http://countdown.localhost:4748/countdown" },
      { name: "Autre site", url: "http://camera-1.example.com:4747/camera/1" },
      { name: "Hôte voisin", url: "http://notlocalhost:4747/head" },
    ];
    const client = createObsClient(
      {
        address: "ws://x",
        micName: "Mic/Aux",
        pageHosts: ["localhost:4747", "127.0.0.1:4747"],
        log: () => undefined,
        onExit: () => undefined,
      },
      fake.socket,
    );
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.refreshed).toEqual(["Tête", "Caméra du salon", "Caméra de la cuisine", "Décompte"]);
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

describe("createObsClient : le tampon de relecture", () => {
  it("donne le chemin du clip à chaque abonné quand OBS dit qu'il a sauvegardé le tampon", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const first: string[] = [];
    const second: string[] = [];
    client.replay.subscribe(({ path }) => first.push(path));
    client.replay.subscribe(({ path }) => second.push(path));
    fake.sendReplaySaved("C:/Users/alexi/Videos/Clips OBS/Replay 2026-10-15 15-09-05.mp4");
    expect(first).toEqual(["C:/Users/alexi/Videos/Clips OBS/Replay 2026-10-15 15-09-05.mp4"]);
    expect(second).toEqual(first);
  });

  it("ne donne plus rien à un abonné qui s'est désabonné", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const paths: string[] = [];
    const unsubscribe = client.replay.subscribe(({ path }) => paths.push(path));
    fake.sendReplaySaved("a.mp4");
    unsubscribe();
    fake.sendReplaySaved("b.mp4");
    expect(paths).toEqual(["a.mp4"]);
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

describe("isShowPage", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("reconnaît la page /show du serveur, avec ou sans barre finale ni paramètres", () => {
    expect(isShowPage("http://localhost:4747/show", hosts)).toBe(true);
    expect(isShowPage("http://127.0.0.1:4747/show/", hosts)).toBe(true);
    expect(isShowPage("http://localhost:4747/show?x=1", hosts)).toBe(true);
  });

  it("refuse une autre page du serveur, le chemin d'un autre, un autre port, une adresse absente ou illisible", () => {
    expect(isShowPage("http://localhost:4747/fox", hosts)).toBe(false);
    expect(isShowPage("http://localhost:4747/shows", hosts)).toBe(false);
    expect(isShowPage("http://localhost:4747/show/autre", hosts)).toBe(false);
    expect(isShowPage("http://localhost:3000/show", hosts)).toBe(false);
    expect(isShowPage(undefined, hosts)).toBe(false);
    expect(isShowPage("pas une adresse", hosts)).toBe(false);
  });
});

type Visibilities = boolean[];

// Un élément d'une scène d'OBS : une source visible, sauf indication contraire.
const item = (name: string, overrides: Partial<ObsSceneItem> = {}): ObsSceneItem => ({
  name,
  kind: "input",
  isEnabled: true,
  ...overrides,
});

describe("createObsClient : la page /show à l'antenne", () => {
  const SHOW_PAGE: ObsPage = { name: "Émission", url: "http://localhost:4747/show" };

  // Un client connecté dont la source /show est dans la scène « jeu » ; `changes` note chaque changement dit aux abonnés.
  const startWithShow = async (
    scenes: Record<string, ObsSceneItem[]>,
    custom: Partial<ObsClientDeps> = {},
  ) => {
    const made = setup([connected], custom);
    made.fake.state.pages = [SHOW_PAGE, { name: "Chat", url: "http://localhost:4747/chat" }];
    made.fake.state.scenes = scenes;
    const changes: Visibilities = [];
    made.client.show.subscribe((isVisible) => changes.push(isVisible));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(200);
    return { ...made, changes };
  };

  const settle = () => vi.advanceTimersByTimeAsync(200);

  it("dit qu'elle est à l'antenne dès la connexion si la scène du programme la montre", async () => {
    const { changes } = await startWithShow({ jeu: [item("Émission")] });
    expect(changes).toEqual([true]);
  });

  it("ne dit rien quand la source est cachée dans la scène du programme", async () => {
    const { changes } = await startWithShow({ jeu: [item("Émission", { isEnabled: false })] });
    expect(changes).toEqual([]);
  });

  it("ne dit rien quand elle est dans une autre scène que celle du programme", async () => {
    const { changes } = await startWithShow({ jeu: [item("Caméra")], pause: [item("Émission")] });
    expect(changes).toEqual([]);
  });

  it("ne prend pas une autre page du serveur pour /show", async () => {
    const { changes } = await startWithShow({ jeu: [item("Chat")] });
    expect(changes).toEqual([]);
  });

  it("dit qu'elle y est quand la scène devient celle du programme, puis qu'elle n'y est plus quand elle la quitte", async () => {
    const { fake, changes } = await startWithShow({ jeu: [item("Caméra")], pause: [item("Émission")] });
    fake.state.programScene = "pause";
    fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([true]);
    fake.state.programScene = "jeu";
    fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([true, false]);
  });

  it("suit la visibilité de la source dans la scène du programme", async () => {
    const { fake, changes } = await startWithShow({ jeu: [item("Émission", { isEnabled: false })] });
    fake.state.scenes = { jeu: [item("Émission")] };
    fake.sendSceneChanged();
    await settle();
    fake.state.scenes = { jeu: [item("Émission", { isEnabled: false })] };
    fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([true, false]);
  });

  it("la trouve dans une scène imbriquée ou un groupe visibles, pas dans ceux qui sont cachés", async () => {
    const scenes = {
      jeu: [item("fond", { kind: "scene" }), item("cadre", { kind: "group" })],
      fond: [item("Caméra")],
      cadre: [item("Émission")],
    };
    const { fake, changes } = await startWithShow(scenes);
    expect(changes).toEqual([true]);
    fake.state.scenes = {
      ...scenes,
      jeu: [item("fond", { kind: "scene" }), item("cadre", { kind: "group", isEnabled: false })],
    };
    fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([true, false]);
  });

  it("n'interroge pas OBS en boucle quand une scène se contient elle-même", async () => {
    const { fake, changes } = await startWithShow({ jeu: [item("jeu", { kind: "scene" })] });
    expect(changes).toEqual([]);
    expect(fake.state.queried.length).toBeLessThanOrEqual(4);
  });

  it("ne dit que les changements, et n'interroge OBS qu'une fois pour une rafale d'évènements", async () => {
    const { fake, changes } = await startWithShow({ jeu: [item("Émission")] });
    const before = fake.state.queried.length;
    for (let burst = 0; burst < 5; burst += 1) fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([true]);
    expect(fake.state.queried.length).toBe(before + 1);
  });

  it("ne pointe que les pages du port du serveur : un serveur d'essai ne voit pas la source du stream", async () => {
    const { changes } = await startWithShow(
      { jeu: [item("Émission")] },
      { pageHosts: ["localhost:4748", "127.0.0.1:4748"] },
    );
    expect(changes).toEqual([]);
  });

  it("dit qu'elle n'est plus à l'antenne quand la connexion à OBS tombe", async () => {
    const { fake, changes } = await startWithShow({ jeu: [item("Émission")] });
    fake.sendClosed();
    expect(changes).toEqual([true, false]);
  });

  it("journalise une fois une scène illisible, sans rien dire aux abonnés", async () => {
    const made = setup([connected]);
    made.fake.state.pages = [SHOW_PAGE];
    made.fake.state.sceneError = new Error("RequestFailed");
    const changes: Visibilities = [];
    made.client.show.subscribe((isVisible) => changes.push(isVisible));
    await vi.advanceTimersByTimeAsync(200);
    made.fake.sendSceneChanged();
    await settle();
    expect(changes).toEqual([]);
    expect(
      made.messages.filter(
        (message) => message === "Émission : la scène du programme est illisible, RequestFailed",
      ),
    ).toHaveLength(1);
  });

  it("ne dit plus rien à un abonné qui s'est désabonné", async () => {
    const { fake, client } = await startWithShow({ jeu: [item("Caméra")] });
    const heard: Visibilities = [];
    const unsubscribe = client.show.subscribe((isVisible) => heard.push(isVisible));
    unsubscribe();
    fake.state.scenes = { jeu: [item("Émission")] };
    fake.sendSceneChanged();
    await settle();
    expect(heard).toEqual([]);
  });
});

describe("toSceneNames", () => {
  it("range les scènes par leur place dans OBS, même quand la réponse arrive à l'envers", () => {
    expect(
      toSceneNames({
        scenes: [
          { sceneName: "Fin", sceneIndex: 2 },
          { sceneName: "Pause", sceneIndex: 1 },
          { sceneName: "Jeu", sceneIndex: 0 },
        ],
      }),
    ).toEqual(["Jeu", "Pause", "Fin"]);
  });

  it("garde l'ordre reçu quand OBS ne donne aucune place", () => {
    expect(toSceneNames({ scenes: [{ sceneName: "Jeu" }, { sceneName: "Pause" }] })).toEqual([
      "Jeu",
      "Pause",
    ]);
  });

  it("ne dit aucun nom pour une réponse sans scène, et refuse une réponse illisible", () => {
    expect(toSceneNames({ scenes: [] })).toEqual([]);
    expect(() => toSceneNames({ scenes: [{ sceneName: 3 }] })).toThrow();
    expect(() => toSceneNames({})).toThrow();
  });
});

describe("createObsClient : les scènes d'OBS", () => {
  it("Quand OBS est joint, le système doit lister les noms des scènes, dans l'ordre d'OBS", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneNames = ["Jeu", "Pause", "Fin"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.listScenes()).toEqual({ ok: true, scenes: ["Jeu", "Pause", "Fin"] });
  });

  it("Quand OBS n'est pas joint, le système doit refuser en français sans interroger OBS", async () => {
    const { fake, client } = setup([unreachable]);
    fake.state.sceneNames = ["Jeu"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.listScenes()).toEqual({ ok: false, reason: "OBS n'est pas connecté" });
  });

  it("Quand la connexion tombe, le système doit refuser comme OBS non joint", async () => {
    const { fake, client } = setup([connected, unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    fake.sendClosed();
    expect(await client.listScenes()).toEqual({ ok: false, reason: "OBS n'est pas connecté" });
  });

  it("Quand OBS refuse de répondre, le système doit refuser en disant pourquoi, sans lever", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneError = new Error("RequestFailed");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.listScenes()).toEqual({
      ok: false,
      reason: "les scènes d'OBS sont illisibles, RequestFailed",
    });
  });
});

describe("createObsClient : passer sur une scène", () => {
  it("Quand la scène existe, le système doit faire passer le programme dessus", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneNames = ["Jeu", "Pause"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.show.updateProgramScene("Pause")).toEqual({ ok: true });
    expect(fake.state.switched).toEqual(["Pause"]);
  });

  it("Quand la scène n'existe pas dans OBS, le système doit refuser en la nommant, sans changer de scène", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneNames = ["Jeu"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.show.updateProgramScene("Pause")).toEqual({
      ok: false,
      reason: "la scène « Pause » n'existe pas dans OBS",
    });
    expect(fake.state.switched).toEqual([]);
  });

  it("Quand OBS n'est pas joint, le système doit refuser sans changer de scène", async () => {
    const { fake, client } = setup([unreachable]);
    fake.state.sceneNames = ["Pause"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.show.updateProgramScene("Pause")).toEqual({
      ok: false,
      reason: "OBS n'est pas connecté",
    });
    expect(fake.state.switched).toEqual([]);
  });

  it("Quand OBS refuse la demande, le système doit rendre son message en refus, sans lever", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneNames = ["Pause"];
    fake.state.switchError = new Error("RequestFailed");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.show.updateProgramScene("Pause")).toEqual({ ok: false, reason: "RequestFailed" });
  });

  it("Quand OBS refuse de lister les scènes, le système doit refuser sans changer de scène", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneError = new Error("RequestFailed");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.show.updateProgramScene("Pause")).toEqual({
      ok: false,
      reason: "les scènes d'OBS sont illisibles, RequestFailed",
    });
    expect(fake.state.switched).toEqual([]);
  });
});

describe("toCameraPages", () => {
  const hosts = ["localhost:4747", "127.0.0.1:4747"];

  it("garde les sources navigateur qui sont la page d'une caméra, avec leur numéro et le nom de leur entrée", () => {
    const pages: ObsPage[] = [
      { name: "Tête", url: "http://localhost:4747/head" },
      { name: "Caméra du salon", url: "http://camera-1.localhost:4747/camera/1" },
      { name: "Caméra de la cuisine", url: "http://camera-2.localhost:4747/camera/2" },
      { name: "Autre port", url: "http://camera-3.localhost:4748/camera/3" },
      { name: "Sans adresse", url: undefined },
    ];
    expect(toCameraPages(pages, hosts)).toEqual([
      { number: 1, input: "Caméra du salon" },
      { number: 2, input: "Caméra de la cuisine" },
    ]);
  });

  it("ne garde que la première source quand deux ont le même numéro", () => {
    const pages: ObsPage[] = [
      { name: "Salon", url: "http://camera-1.localhost:4747/camera/1" },
      { name: "Salon bis", url: "http://camera-1.localhost:4747/camera/1" },
    ];
    expect(toCameraPages(pages, hosts)).toEqual([{ number: 1, input: "Salon" }]);
  });
});

describe("toCameraSources", () => {
  const hosts = ["localhost:4747"];

  it("garde toutes les sources de chaque numéro, dans l'ordre d'OBS, et laisse de côté les autres pages", () => {
    const pages: ObsPage[] = [
      { name: "Tête", url: "http://localhost:4747/head" },
      { name: "Salon", url: "http://camera-1.localhost:4747/camera/1" },
      { name: "Cuisine", url: "http://camera-2.localhost:4747/camera/2" },
      { name: "Salon bis", url: "http://camera-1.localhost:4747/camera/1" },
    ];
    expect(toCameraSources(pages, hosts)).toEqual([
      { number: 1, input: "Salon" },
      { number: 2, input: "Cuisine" },
      { number: 1, input: "Salon bis" },
    ]);
  });
});

describe("createObsClient : la régie", () => {
  const cameraPages: ObsPage[] = [
    { name: "Tête", url: "http://localhost:4747/head" },
    { name: "Caméra du salon", url: "http://camera-1.localhost:4747/camera/1" },
    { name: "Caméra de la cuisine", url: "http://camera-2.localhost:4747/camera/2" },
  ];

  it("n'a rien à dire tant qu'OBS n'est pas joint : hors ligne, sans scène ni micro", async () => {
    const { client } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.getState("Mic/Aux")).toEqual({
      isLinked: false,
      scene: null,
      scenes: [],
      isPcMuted: null,
      cameras: [],
      onAir: [],
      picture: [],
    });
  });

  it("lit la scène du programme, les scènes, la coupure du mic du PC et celle de la source de chaque caméra", async () => {
    const { fake, client } = setup([connected]);
    fake.state.programScene = "Jeu";
    fake.state.sceneNames = ["Jeu", "Pause"];
    fake.state.pages = cameraPages;
    fake.state.muted = new Set(["Caméra de la cuisine"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.getState("Mic/Aux")).toEqual({
      isLinked: true,
      scene: "Jeu",
      scenes: ["Jeu", "Pause"],
      isPcMuted: false,
      cameras: [
        { number: 1, input: "Caméra du salon", isMuted: false },
        { number: 2, input: "Caméra de la cuisine", isMuted: true },
      ],
      onAir: [],
      picture: [],
    });
  });

  it("dit `null` pour le mic du PC quand OBS ne connaît pas cette entrée, et laisse de côté une caméra dont la coupure est illisible", async () => {
    const { fake, client } = setup([connected]);
    fake.state.pages = cameraPages;
    fake.state.muteError = new Error("ResourceNotFound");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.getState("Inconnu")).toMatchObject({
      isLinked: true,
      isPcMuted: null,
      cameras: [],
    });
  });

  it("dit à l'antenne la caméra dont une source est visible dans la scène du programme, scènes et groupes compris", async () => {
    const { fake, client } = setup([connected]);
    fake.state.pages = cameraPages;
    fake.state.scenes = {
      jeu: [
        item("fond", { kind: "scene" }),
        item("cadre", { kind: "group" }),
        item("Caméra de la cuisine", { isEnabled: false }),
      ],
      fond: [item("Caméra du salon")],
      cadre: [item("Tête")],
    };
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([1]);
  });

  it("ne dit pas à l'antenne une caméra dont la source est cachée, ni celle qui n'est que dans une autre scène", async () => {
    const { fake, client } = setup([connected]);
    fake.state.pages = cameraPages;
    fake.state.scenes = {
      jeu: [item("Caméra du salon", { isEnabled: false })],
      pause: [item("Caméra de la cuisine")],
    };
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([]);
  });

  it("dit à l'antenne une caméra dès que l'une de ses sources l'est, même quand ce n'est pas la première (celle de son micro)", async () => {
    const { fake, client } = setup([connected]);
    fake.state.pages = [
      ...cameraPages,
      { name: "Salon bis", url: "http://camera-1.localhost:4747/camera/1" },
    ];
    fake.state.scenes = { jeu: [item("Salon bis")] };
    await vi.advanceTimersByTimeAsync(0);
    const state = await client.control.getState("Mic/Aux");
    expect(state.onAir).toEqual([1]);
    expect(state.cameras.map(({ input }) => input)).toEqual(["Caméra du salon", "Caméra de la cuisine"]);
  });

  it("suit la source quand elle apparaît ou disparaît de la scène du programme, ou que le programme change de scène", async () => {
    const { fake, client } = setup([connected]);
    fake.state.pages = cameraPages;
    fake.state.scenes = { jeu: [], pause: [item("Caméra du salon")] };
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([]);
    fake.state.scenes = { jeu: [item("Caméra du salon")], pause: [] };
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([1]);
    fake.state.scenes = { jeu: [item("Caméra du salon", { isEnabled: false })], pause: [] };
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([]);
    fake.state.programScene = "pause";
    fake.state.scenes = { jeu: [], pause: [item("Caméra de la cuisine")] };
    expect((await client.control.getState("Mic/Aux")).onAir).toEqual([2]);
  });

  it("Si OBS refuse de répondre, alors le système doit rester joint et vide, et le dire une fois dans le journal", async () => {
    const { fake, client, messages } = setup([connected]);
    fake.state.sceneError = new Error("RequestFailed");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.getState("Mic/Aux")).toEqual({
      isLinked: true,
      scene: null,
      scenes: [],
      isPcMuted: null,
      cameras: [],
      onAir: [],
      picture: [],
    });
    await client.control.getState("Mic/Aux");
    expect(messages.filter((line) => line.startsWith("Régie : l'état d'OBS est illisible"))).toHaveLength(1);
  });

  it("prévient la régie 150 ms après le dernier évènement de scène ou de coupure, une seule fois", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(1000);
    let calls = 0;
    client.control.subscribe(() => {
      calls += 1;
    });
    fake.sendSceneChanged();
    fake.sendInputMute("Mic/Aux", true);
    fake.sendSceneChanged();
    await vi.advanceTimersByTimeAsync(149);
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(1);
  });

  it("prévient la régie quand OBS est joint, et quand la connexion est perdue", async () => {
    const { fake, client } = setup([connected, unreachable]);
    let calls = 0;
    client.control.subscribe(() => {
      calls += 1;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    fake.sendClosed();
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(2);
  });

  it("ne prévient plus celle qui s'est désabonnée", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(1000);
    let calls = 0;
    const stop = client.control.subscribe(() => {
      calls += 1;
    });
    stop();
    fake.sendSceneChanged();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(0);
  });

  it("coupe et rouvre une entrée dans OBS", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updateInputMute("Mic/Aux", true)).toEqual({ ok: true });
    expect(await client.control.updateInputMute("Caméra du salon", false)).toEqual({ ok: true });
    expect(fake.state.muteUpdates).toEqual(["Mic/Aux:coupé", "Caméra du salon:ouvert"]);
  });

  it("refuse quand OBS n'est pas joint, ou qu'OBS refuse, en nommant l'entrée, sans lever", async () => {
    const offline = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await offline.client.control.updateInputMute("Mic/Aux", true)).toEqual({
      ok: false,
      reason: "OBS n'est pas connecté",
    });
    const refusing = setup([connected]);
    refusing.fake.state.muteUpdateError = new Error("ResourceNotFound");
    await vi.advanceTimersByTimeAsync(0);
    expect(await refusing.client.control.updateInputMute("Caméra du salon", false)).toEqual({
      ok: false,
      reason: "OBS refuse de rouvrir l'entrée « Caméra du salon » (ResourceNotFound)",
    });
  });

  it("passe une scène à l'antenne comme le fait l'émission, avec le même refus pour une scène inconnue", async () => {
    const { fake, client } = setup([connected]);
    fake.state.sceneNames = ["Jeu", "Pause"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updateProgramScene("Pause")).toEqual({ ok: true });
    expect(await client.control.updateProgramScene("Cuisine")).toEqual({
      ok: false,
      reason: "la scène « Cuisine » n'existe pas dans OBS",
    });
    expect(fake.state.switched).toEqual(["Pause"]);
  });
});

describe("createObsClient : la place caméra", () => {
  const SCENE = "Master - Webcam";
  const ADDRESSES: ObsPage[] = [
    { name: "SouthPark", url: "http://localhost:4747/head" },
    { name: "Caméra 2", url: "http://camera-2.localhost:4747/camera/2" },
    { name: "Titre", url: "https://example.com/titre" },
  ];
  const pictureItem = (id: number, name: string, inputKind: string, isEnabled: boolean): PictureItem => ({
    id,
    name,
    kind: "input",
    inputKind,
    isEnabled,
  });
  // La place de l'OBS d'Alexis : le PC visible, la tête cachée, la caméra 2 cachée et présente deux fois, une image et une page d'un autre
  // site qui ne sont pas des membres. Neuve à chaque appel : le faux OBS change la visibilité des éléments qu'il rend.
  const place = (): PictureItem[] => [
    pictureItem(1, "Webcam PC", "dshow_input", true),
    pictureItem(2, "SouthPark", "browser_source", false),
    pictureItem(3, "Caméra 2", "browser_source", false),
    pictureItem(4, "Caméra 2", "browser_source", false),
    pictureItem(5, "Cadre", "image_source", true),
    pictureItem(6, "Titre", "browser_source", true),
  ];
  const setupPlace = (connections: ObsConnection[] = [connected]) => {
    const made = setup(connections, { cameraSlotScene: SCENE });
    made.fake.state.pages = ADDRESSES;
    made.fake.state.places[SCENE] = place();
    return made;
  };

  it("lit les membres de la place dans l'ordre d'OBS, avec celui qui est visible, et laisse de côté ce qui n'en est pas un", async () => {
    const { client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.control.getState("Mic/Aux")).picture).toEqual([
      { id: "pc", label: "PC", isVisible: true },
      { id: "head", label: "Tête", isVisible: false },
      { id: "camera-2", label: "Caméra 2", isVisible: false },
    ]);
  });

  it("n'a pas de place quand cameraSlotScene n'est pas réglé", async () => {
    const { fake, client } = setup([connected]);
    fake.state.places[SCENE] = place();
    await vi.advanceTimersByTimeAsync(0);
    expect((await client.control.getState("Mic/Aux")).picture).toEqual([]);
  });

  it("suit la visibilité quand Alexis la change à la main dans OBS", async () => {
    const { fake, client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    for (const element of fake.state.places[SCENE] ?? []) {
      if (element.id === 1) element.isEnabled = false;
      if (element.id === 2) element.isEnabled = true;
    }
    expect(
      (await client.control.getState("Mic/Aux")).picture.map(({ id, isVisible }) => `${id}:${isVisible}`),
    ).toEqual(["pc:false", "head:true", "camera-2:false"]);
  });

  it("garde le reste de l'état quand la place est illisible, et le dit une seule fois dans le journal", async () => {
    const { fake, client, messages } = setup([connected], { cameraSlotScene: "Introuvable" });
    fake.state.programScene = "Jeu";
    fake.state.sceneNames = ["Jeu"];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.getState("Mic/Aux")).toMatchObject({
      scene: "Jeu",
      scenes: ["Jeu"],
      picture: [],
    });
    await client.control.getState("Mic/Aux");
    expect(
      messages.filter((line) => line.startsWith("Régie : la place caméra « Introuvable » est illisible")),
    ).toHaveLength(1);
  });

  it("montre tous les éléments du membre choisi puis cache les autres membres, sans toucher à l'image ni à la page d'un autre site", async () => {
    const { fake, client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updatePicture("camera-2")).toEqual({ ok: true });
    expect(fake.state.visibility).toEqual([
      "Master - Webcam:3:visible",
      "Master - Webcam:4:visible",
      "Master - Webcam:1:caché",
    ]);
    expect((await client.control.getState("Mic/Aux")).picture.filter(({ isVisible }) => isVisible)).toEqual([
      { id: "camera-2", label: "Caméra 2", isVisible: true },
    ]);
  });

  it("ne demande rien à OBS quand le membre choisi est déjà seul à l'image", async () => {
    const { fake, client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updatePicture("pc")).toEqual({ ok: true });
    expect(fake.state.visibility).toEqual([]);
  });

  it("cache les éléments visibles de plusieurs membres quand OBS en avait laissé plusieurs", async () => {
    const { fake, client } = setupPlace();
    for (const element of fake.state.places[SCENE] ?? []) if (element.id === 2) element.isEnabled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updatePicture("head")).toEqual({ ok: true });
    expect(fake.state.visibility).toEqual(["Master - Webcam:1:caché"]);
  });

  it("refuse un membre qui n'est pas dans la place, sans rien changer", async () => {
    const { fake, client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.updatePicture("camera-7")).toEqual({
      ok: false,
      reason: "la scène « Master - Webcam » ne contient pas ce membre",
    });
    expect(fake.state.visibility).toEqual([]);
  });

  it("refuse sans rien demander quand OBS n'est pas joint ou que cameraSlotScene n'est pas réglé", async () => {
    const offline = setupPlace([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await offline.client.control.updatePicture("pc")).toEqual({
      ok: false,
      reason: "OBS n'est pas connecté",
    });
    const unset = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await unset.client.control.updatePicture("pc")).toEqual({
      ok: false,
      reason: "cameraSlotScene n'est pas réglé dans settings.json",
    });
  });

  it("rend le refus d'OBS en une phrase, sans lever", async () => {
    const { fake, client } = setupPlace();
    await vi.advanceTimersByTimeAsync(0);
    fake.state.visibilityError = new Error("RequestFailed");
    expect(await client.control.updatePicture("head")).toEqual({
      ok: false,
      reason: "OBS refuse de changer l'image (RequestFailed)",
    });
  });
});

describe("createObsClient : les levels de toutes les entrées", () => {
  it("transmet en dB le pic le plus fort de chaque entrée, avec son nom, à ceux qui en suivent", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const heard: string[] = [];
    client.levels.subscribe((input, level) => heard.push(`${input} ${level.toFixed(1)}`));
    fake.sendLevels([
      { name: "Caméra du salon", peaks: [0.01, 0.1] },
      { name: "Audio du bureau", peaks: [1, 1] },
    ]);
    expect(heard).toEqual(["Caméra du salon -20.0", "Audio du bureau 0.0"]);
  });

  it("ne transmet plus rien à qui s'est désabonné, et laisse le mic et le son du PC lire les mêmes levels", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const heard: string[] = [];
    const stop = client.levels.subscribe((input) => heard.push(input));
    const micLevels: number[] = [];
    client.mic.subscribe((level) => micLevels.push(level));
    stop();
    fake.sendLevels([{ name: "Mic/Aux", peaks: [0.5] }]);
    expect(heard).toEqual([]);
    expect(micLevels).toHaveLength(1);
  });
});

describe("createObsClient : les filtres du boost d'une caméra", () => {
  const SOURCE = "Caméra du salon";
  const BOOST = { name: "Gain (appli)", kind: "gain_filter" };
  const LIMITER = { name: "Limiteur (appli)", kind: "limiter_filter" };
  const BOOST_CREATED = `${SOURCE}:créé:Gain (appli):gain_filter:{"db":0}`;
  const LIMITER_CREATED = `${SOURCE}:créé:Limiteur (appli):limiter_filter:{"threshold":-3}`;

  it("pose le filtre de boost à 0 dB puis le limiteur vers -3 dB, dans cet ordre, sur une source qui n'a aucun filtre", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 0 });
    expect(fake.state.filterCalls).toEqual([BOOST_CREATED, LIMITER_CREATED]);
    expect(fake.state.filters[SOURCE]?.map(({ name }) => name)).toEqual(["Gain (appli)", "Limiteur (appli)"]);
  });

  it("ne les pose qu'une fois : un second appel ne crée rien", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    await client.boost.createFilters(SOURCE);
    fake.state.filterCalls.length = 0;
    expect(await client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 0 });
    expect(fake.state.filterCalls).toEqual([]);
  });

  it("ne touche pas à un limiteur qui existe déjà, le nôtre réglé à la main ou celui d'Alexis sous un autre nom", async () => {
    const own = setup([connected]);
    own.fake.state.filters[SOURCE] = [
      { ...BOOST, settings: { db: 4 } },
      { ...LIMITER, settings: { threshold: -9 } },
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(await own.client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 4 });
    expect(own.fake.state.filterCalls).toEqual([]);
    expect(own.fake.state.filters[SOURCE]?.[1]?.settings).toEqual({ threshold: -9 });

    const hers = setup([connected]);
    hers.fake.state.filters[SOURCE] = [
      { name: "Mon limiteur", kind: "limiter_filter", settings: { threshold: -1 } },
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(await hers.client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 0 });
    expect(hers.fake.state.filterCalls).toEqual([BOOST_CREATED]);
    expect(hers.fake.state.filters[SOURCE]?.map(({ name }) => name)).toEqual([
      "Mon limiteur",
      "Gain (appli)",
    ]);
  });

  it("garde les autres filtres de la source et reprend le boost du filtre de boost déjà posé", async () => {
    const { fake, client } = setup([connected]);
    fake.state.filters[SOURCE] = [
      { name: "Compresseur", kind: "compressor_filter", settings: { ratio: 4 } },
      { ...BOOST, settings: { db: 6.5 } },
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 6.5 });
    expect(fake.state.filterCalls).toEqual([LIMITER_CREATED]);
    expect(fake.state.filters[SOURCE]?.[0]?.settings).toEqual({ ratio: 4 });
  });

  it("repart de 0 dB quand le filtre de boost n'a pas de réglage lisible", async () => {
    const { fake, client } = setup([connected]);
    fake.state.filters[SOURCE] = [{ ...BOOST, settings: { db: "fort" } }];
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.boost.createFilters(SOURCE)).toEqual({ ok: true, boostDb: 0 });
  });

  it("règle le boost du filtre de l'appli seulement, sans toucher au limiteur ni aux autres filtres", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    await client.boost.createFilters(SOURCE);
    fake.state.filterCalls.length = 0;
    expect(await client.boost.updateBoost(SOURCE, 7.5)).toEqual({ ok: true });
    expect(fake.state.filterCalls).toEqual([`${SOURCE}:réglé:Gain (appli):{"db":7.5}`]);
    expect(fake.state.filters[SOURCE]?.[0]?.settings).toEqual({ db: 7.5 });
    expect(fake.state.filters[SOURCE]?.[1]?.settings).toEqual({ threshold: -3 });
  });

  it("refuse sans rien demander quand OBS n'est pas joint", async () => {
    const { fake, client } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.boost.createFilters(SOURCE)).toEqual({ ok: false, reason: "OBS n'est pas connecté" });
    expect(await client.boost.updateBoost(SOURCE, 3)).toEqual({
      ok: false,
      reason: "OBS n'est pas connecté",
    });
    expect(fake.state.filterCalls).toEqual([]);
  });

  it("rend le refus d'OBS en une phrase qui nomme la source, sans lever", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    fake.state.filterError = new Error("ResourceNotFound");
    expect(await client.boost.createFilters(SOURCE)).toEqual({
      ok: false,
      reason: "OBS refuse de poser les filtres de « Caméra du salon » (ResourceNotFound)",
    });
    expect(await client.boost.updateBoost(SOURCE, 3)).toEqual({
      ok: false,
      reason: "OBS refuse de régler le boost de « Caméra du salon » (ResourceNotFound)",
    });
  });
});

describe("createObsClient : arrêter le live", () => {
  it("demande à OBS d'arrêter la diffusion", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.stopStream()).toEqual({ ok: true });
    expect(fake.state.stops).toBe(1);
  });

  it("refuse sans rien demander quand OBS n'est pas joint", async () => {
    const { fake, client } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.stopStream()).toEqual({ ok: false, reason: "OBS n'est pas connecté" });
    expect(fake.state.stops).toBe(0);
  });

  it("rend le refus d'OBS en une phrase, sans lever", async () => {
    const { fake, client } = setup([connected]);
    fake.state.stopError = new Error("OutputNotRunning");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.control.stopStream()).toEqual({
      ok: false,
      reason: "OBS refuse d'arrêter le live (OutputNotRunning)",
    });
  });
});

describe("createObsClient : le retour antenne", () => {
  const JPEG_START = [0xff, 0xd8, 0xff, 0xe0];

  it("demande à OBS la scène donnée en 640 px de large et rend les octets du JPEG, sans le préfixe data:", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    const shot = await client.monitor.getImage("Jeu");
    expect(shot.ok).toBe(true);
    expect(shot.ok && [...shot.bytes]).toEqual(JPEG_START);
    expect(fake.state.screenshots).toEqual(["Jeu:640"]);
  });

  it("lit aussi un base64 nu, sans préfixe", async () => {
    const { fake, client } = setup([connected]);
    fake.state.screenshot = "/9j/4A==";
    await vi.advanceTimersByTimeAsync(0);
    const shot = await client.monitor.getImage("Jeu");
    expect(shot.ok && [...shot.bytes]).toEqual(JPEG_START);
  });

  it("refuse sans rien capturer quand OBS n'est pas joint", async () => {
    const { fake, client } = setup([unreachable]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.monitor.getImage("Jeu")).toEqual({ ok: false, reason: "OBS n'est pas connecté" });
    expect(fake.state.screenshots).toEqual([]);
  });

  it("rend le refus d'OBS en une phrase qui nomme la scène, sans lever", async () => {
    const { fake, client } = setup([connected]);
    fake.state.screenshotError = new Error("ResourceNotFound");
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.monitor.getImage("Jeu")).toEqual({
      ok: false,
      reason: "OBS ne capture pas la scène « Jeu » (ResourceNotFound)",
    });
  });

  it("refuse une image qui n'est pas du base64, ou vide, avec ou sans préfixe", async () => {
    const { fake, client } = setup([connected]);
    await vi.advanceTimersByTimeAsync(0);
    for (const screenshot of ["%%%", "", "data:image/jpg;base64,", "data:image/jpg;base64,%%%"]) {
      fake.state.screenshot = screenshot;
      expect(await client.monitor.getImage("Jeu")).toEqual({
        ok: false,
        reason: "OBS rend une image illisible",
      });
    }
  });
});
