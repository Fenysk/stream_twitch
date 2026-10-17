import OBSWebSocket, { EventSubscription, OBSWebSocketError } from "obs-websocket-js/json";
import { z } from "zod";
import { toLevel } from "../domain/mic.rules";
import type { ReplayPort } from "../usecase/clip-chat.usecase";
import type { DesktopPort } from "../usecase/fox-balance.usecase";
import type { Broadcast, BroadcastPort } from "../usecase/fox-hours.usecase";
import type { MicPort } from "../usecase/head.usecase";
import type { ShowScenePort } from "../usecase/show-director.usecase";

const PASSWORD_REFUSED_CODE = 4009;
const RETRY_MS = 2000;
const GIVE_UP_MS = 30_000;
const MIC_UNSEEN_MS = 5000;

export type ObsInputPeaks = { name: string; peaks: number[] };
export type ObsPage = { name: string; url: string | undefined };
// Ce qu'une scène (ou un groupe) contient : une source, une autre scène ou un groupe, et si cet élément est visible dans elle.
export type ObsSceneItem = { name: string; kind: "input" | "scene" | "group"; isEnabled: boolean };
export type ObsConnection =
  | { ok: true; version: string }
  | { ok: false; isPasswordRefused: boolean; reason: string };

// Ce que le client attend d'OBS ; `createObsSocket` l'implémente avec obs-websocket-js, les tests avec un faux.
export type ObsSocket = {
  connect(): Promise<ObsConnection>;
  listPages(): Promise<ObsPage[]>;
  refreshPage(name: string): Promise<void>;
  // La scène du programme (celle qui passe à l'antenne, pas l'aperçu du mode studio).
  getProgramScene(): Promise<string>;
  // Les éléments d'une scène, ou d'un groupe (`isGroup`), tels qu'OBS les range.
  listSceneItems(sceneName: string, isGroup: boolean): Promise<ObsSceneItem[]>;
  // Quelque chose a changé qui peut changer ce que le programme montre : la scène du programme, la visibilité d'un élément, une
  // source ou une scène créée, retirée, renommée, l'adresse d'une source navigateur.
  onSceneChanged(listener: () => void): void;
  onLevels(listener: (inputs: ObsInputPeaks[]) => void): void;
  // L'entrée est-elle coupée à l'instant ? Une entrée inconnue d'OBS fait échouer la demande.
  getInputMute(name: string): Promise<boolean>;
  // Une entrée est coupée (`true`) ou rouverte (`false`).
  onInputMute(listener: (name: string, isMuted: boolean) => void): void;
  // L'état de la diffusion à l'instant : en direct ou non, et depuis combien de ms.
  getStreamStatus(): Promise<{ isLive: boolean; durationMs: number }>;
  // La diffusion démarre (`true`) ou s'arrête (`false`) ; ses autres états (démarrage, coupure réseau) ne comptent pas.
  onStreamState(listener: (isLive: boolean) => void): void;
  // OBS vient de sauvegarder le tampon de relecture : le chemin du clip qu'il a écrit (évènement ReplayBufferSaved).
  onReplaySaved(listener: (path: string) => void): void;
  onExitStarted(listener: () => void): void;
  onClosed(listener: () => void): void;
};

const MetersSchema = z.object({
  inputs: z.array(z.object({ inputName: z.string(), inputLevelsMul: z.array(z.array(z.number())) })),
});

// GetInputMute et InputMuteStateChanged : `inputMuted` dit si l'entrée est coupée.
const InputMuteSchema = z.object({ inputMuted: z.boolean() });
const InputMuteEventSchema = z.object({ inputName: z.string(), inputMuted: z.boolean() });

// GetStreamStatus : `outputDuration` est en ms. StreamStateChanged : OBS_WEBSOCKET_OUTPUT_STARTED, _STOPPED (et _STARTING,
// _STOPPING, _RECONNECTING, _RECONNECTED, que le renard laisse de côté : une coupure réseau garde la durée).
const StreamStatusSchema = z.object({ outputActive: z.boolean(), outputDuration: z.number() });
const StreamStateSchema = z.object({ outputState: z.string() });
// ReplayBufferSaved : `savedReplayPath` est le fichier que le tampon de relecture vient d'écrire.
const ReplaySavedSchema = z.object({ savedReplayPath: z.string() });
const STREAM_STARTED = "OBS_WEBSOCKET_OUTPUT_STARTED";
const STREAM_STOPPED = "OBS_WEBSOCKET_OUTPUT_STOPPED";

// GetCurrentProgramScene : `sceneName` (obs-websocket 5.4+), `currentProgramSceneName` avant.
const ProgramSceneSchema = z.object({
  sceneName: z.string().optional(),
  currentProgramSceneName: z.string().optional(),
});
// GetSceneItemList et GetGroupSceneItemList : `sourceType` dit si l'élément est une source ou une scène, `isGroup` un groupe.
const SceneItemsSchema = z.object({
  sceneItems: z.array(
    z.object({
      sourceName: z.string(),
      sourceType: z.string(),
      sceneItemEnabled: z.boolean(),
      isGroup: z.boolean().nullable().optional(),
    }),
  ),
});
const SCENE_SOURCE_TYPE = "OBS_SOURCE_TYPE_SCENE";

const toSceneItemKind = (sourceType: string, isGroup: boolean | null | undefined): ObsSceneItem["kind"] => {
  if (sourceType !== SCENE_SOURCE_TYPE) return "input";
  return isGroup ? "group" : "scene";
};

export function createObsSocket(options: {
  address: string;
  password: string | undefined;
  log: (message: string) => void;
}): ObsSocket {
  const obs = new OBSWebSocket();
  let isMalformedLogged = false;
  return {
    async connect() {
      try {
        // InputVolumeMeters est un évènement à haut volume : il faut l'abonner en plus des catégories par défaut.
        const hello = await obs.connect(options.address, options.password, {
          eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters,
          rpcVersion: 1,
        });
        return { ok: true, version: hello.obsWebSocketVersion };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const isPasswordRefused = error instanceof OBSWebSocketError && error.code === PASSWORD_REFUSED_CODE;
        return { ok: false, isPasswordRefused, reason };
      }
    },
    async listPages() {
      const { inputs } = await obs.call("GetInputList", { inputKind: "browser_source" });
      const pages: ObsPage[] = [];
      for (const { inputName } of z.array(z.object({ inputName: z.string() })).parse(inputs)) {
        const { inputSettings } = await obs.call("GetInputSettings", { inputName });
        pages.push({
          name: inputName,
          url: z.object({ url: z.string().optional() }).parse(inputSettings).url,
        });
      }
      return pages;
    },
    async refreshPage(name) {
      await obs.call("PressInputPropertiesButton", { inputName: name, propertyName: "refreshnocache" });
    },
    async getProgramScene() {
      const parsed = ProgramSceneSchema.parse(await obs.call("GetCurrentProgramScene"));
      const name = parsed.sceneName ?? parsed.currentProgramSceneName;
      if (name === undefined) throw new Error("OBS n'a pas dit quelle scène passe à l'antenne");
      return name;
    },
    async listSceneItems(sceneName, isGroup) {
      const answer = isGroup
        ? await obs.call("GetGroupSceneItemList", { sceneName })
        : await obs.call("GetSceneItemList", { sceneName });
      return SceneItemsSchema.parse(answer).sceneItems.map((item) => ({
        name: item.sourceName,
        kind: toSceneItemKind(item.sourceType, item.isGroup),
        isEnabled: item.sceneItemEnabled,
      }));
    },
    onSceneChanged(listener) {
      const notify = () => listener();
      obs.on("CurrentProgramSceneChanged", notify);
      obs.on("SceneItemEnableStateChanged", notify);
      obs.on("SceneItemCreated", notify);
      obs.on("SceneItemRemoved", notify);
      obs.on("SceneRemoved", notify);
      obs.on("SceneNameChanged", notify);
      obs.on("InputSettingsChanged", notify);
      obs.on("InputRemoved", notify);
      obs.on("InputNameChanged", notify);
    },
    onLevels(listener) {
      obs.on("InputVolumeMeters", (data) => {
        const parsed = MetersSchema.safeParse(data);
        if (parsed.success) {
          // Le pic d'un canal est le 2e nombre : [magnitude, pic, pic d'entrée].
          listener(
            parsed.data.inputs.map((input) => ({
              name: input.inputName,
              peaks: input.inputLevelsMul.map((channel) => channel[1] ?? 0),
            })),
          );
        } else if (!isMalformedLogged) {
          isMalformedLogged = true;
          options.log(`Évènement InputVolumeMeters illisible, ignoré : ${parsed.error.message}`);
        }
      });
    },
    async getInputMute(name) {
      return InputMuteSchema.parse(await obs.call("GetInputMute", { inputName: name })).inputMuted;
    },
    onInputMute(listener) {
      obs.on("InputMuteStateChanged", (data) => {
        const parsed = InputMuteEventSchema.safeParse(data);
        if (parsed.success) listener(parsed.data.inputName, parsed.data.inputMuted);
      });
    },
    async getStreamStatus() {
      const status = StreamStatusSchema.parse(await obs.call("GetStreamStatus"));
      return { isLive: status.outputActive, durationMs: status.outputDuration };
    },
    onStreamState(listener) {
      obs.on("StreamStateChanged", (data) => {
        const parsed = StreamStateSchema.safeParse(data);
        if (!parsed.success) return;
        if (parsed.data.outputState === STREAM_STARTED) listener(true);
        else if (parsed.data.outputState === STREAM_STOPPED) listener(false);
      });
    },
    onReplaySaved(listener) {
      obs.on("ReplayBufferSaved", (data) => {
        const parsed = ReplaySavedSchema.safeParse(data);
        if (parsed.success) listener(parsed.data.savedReplayPath);
      });
    },
    onExitStarted(listener) {
      obs.on("ExitStarted", listener);
    },
    onClosed(listener) {
      obs.on("ConnectionClosed", () => listener());
    },
  };
}

// La page du serveur : une source navigateur dont l'URL pointe vers l'un de ses hôtes (localhost:4747, 127.0.0.1:4747).
export function isOwnPage(url: string | undefined, hosts: string[]): boolean {
  return url !== undefined && URL.canParse(url) && hosts.includes(new URL(url).host);
}

// La page de l'émission : une page du serveur dont le chemin est /show.
export function isShowPage(url: string | undefined, hosts: string[]): boolean {
  return url !== undefined && isOwnPage(url, hosts) && new URL(url).pathname.replace(/\/+$/, "") === "/show";
}

// Les scènes dans les scènes (et les groupes) se suivent sur trois niveaux : au-delà, ou en boucle, rien n'est cherché.
const SCENE_DEPTH_MAX = 3;
// Un changement de scène envoie plusieurs évènements à la suite : OBS n'est interrogé qu'une fois, 150 ms après le dernier.
const SCENE_SETTLE_MS = 150;

// L'une des sources `names` est-elle visible dans cette scène (ou ce groupe), de son propre chef et dans chaque scène ou groupe visible
// qu'elle contient ?
async function hasVisibleSource(
  socket: ObsSocket,
  scene: { name: string; isGroup: boolean },
  names: ReadonlySet<string>,
  depth: number,
): Promise<boolean> {
  const items = await socket.listSceneItems(scene.name, scene.isGroup);
  for (const item of items.filter(({ isEnabled }) => isEnabled)) {
    if (item.kind === "input") {
      if (names.has(item.name)) return true;
    } else if (depth < SCENE_DEPTH_MAX) {
      const inside = { name: item.name, isGroup: item.kind === "group" };
      if (await hasVisibleSource(socket, inside, names, depth + 1)) return true;
    }
  }
  return false;
}

export type ObsClientDeps = {
  address: string;
  micName: string;
  // La source du son du PC ; absente, il n'est pas suivi.
  desktopName?: string | undefined;
  pageHosts: string[];
  log: (message: string) => void;
  onExit: (reason: string) => void;
};

// L'état d'OBS pour l'interface : est-il joint, et quelles entrées audio sont passées (de quoi choisir le micro).
export type ObsStatus = { isLinked: boolean; inputNames: string[] };

export type ObsClient = {
  mic: MicPort;
  desktop: DesktopPort;
  broadcast: BroadcastPort;
  // Les clips que le tampon de relecture sauvegarde.
  replay: ReplayPort;
  // La page /show à l'antenne ou non.
  show: ShowScenePort;
  start(): void;
  stop(): void;
  updateMicName(name: string): void;
  updateDesktopName(name: string | undefined): void;
  getStatus(): ObsStatus;
};

export function createObsClient(deps: ObsClientDeps, socket: ObsSocket): ObsClient {
  const { address, pageHosts, log, onExit } = deps;
  const namesSeen = new Set<string>();
  let hasConnected = false;
  let isLinked = false;
  let isStopped = false;
  let isRefusedLogged = false;
  let isUnreachableLogged = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

  // Une entrée audio suivie par son nom (le mic, le son du PC) : son level part à ses abonnés, et le journal dit si elle n'est
  // dans aucun évènement reçu 5 s après la connexion. `label` la nomme dans le journal (« du micro »).
  const watch = (label: string, firstName: string | undefined) => {
    let name = firstName;
    const listeners = new Set<(level: number) => void>();
    let isSeen = false;
    let isWarned = false;
    let isMuted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // L'entrée est coupée ou rouverte dans OBS (`inputName` d'une autre entrée : ignoré).
    const mute = (inputName: string, isMutedNow: boolean) => {
      if (inputName !== name || isMutedNow === isMuted) return;
      isMuted = isMutedNow;
      log(
        isMuted
          ? `Entrée ${label} « ${name} » coupée dans OBS : son level reste à -100 dB.`
          : `Entrée ${label} « ${name} » rouverte dans OBS.`,
      );
    };

    // L'état de coupure à l'instant. Une entrée inconnue d'OBS refuse la demande : l'avertissement des 5 s le dit déjà.
    const refreshMute = () => {
      const target = name;
      if (target === undefined) return;
      socket.getInputMute(target).then(
        (isMutedNow) => mute(target, isMutedNow),
        () => undefined,
      );
    };

    const warnIfUnseen = () => {
      if (name === undefined || isSeen || isWarned) return;
      isWarned = true;
      const names = [...namesSeen].map((seen) => `« ${seen} »`).join(", ") || "(aucune)";
      log(
        `Attention : l'entrée « ${name} » n'est dans aucun évènement reçu depuis 5 s, le niveau reste à zéro. Entrées reçues : ${names}. Vérifier l'entrée ${label} dans les réglages.`,
      );
    };

    return {
      port: {
        subscribe(listener: (level: number) => void) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      // La connexion vient d'aboutir : le journal dit ce qui est suivi, et l'attente de 5 s commence.
      arm() {
        if (name === undefined) return;
        log(`Abonné au niveau ${label} « ${name} » (InputVolumeMeters, toutes les 50 ms).`);
        timer = setTimeout(warnIfUnseen, MIC_UNSEEN_MS);
        refreshMute();
      },
      disarm() {
        clearTimeout(timer);
      },
      hear(input: ObsInputPeaks) {
        if (input.name !== name) return;
        if (!isSeen) {
          isSeen = true;
          log(`Niveau ${label} « ${name} » reçu.`);
        }
        // Coupée dans OBS, une entrée est muette même si OBS envoie encore des pics : aucun canal, le plancher.
        const level = toLevel(isMuted ? [] : input.peaks);
        for (const listener of listeners) listener(level);
      },
      mute,
      rename(next: string | undefined) {
        if (next === name) return;
        name = next;
        isSeen = false;
        isWarned = false;
        isMuted = false;
        clearTimeout(timer);
        if (next === undefined) return;
        log(`Entrée ${label} changée : « ${next} ».`);
        if (!isLinked) return;
        timer = setTimeout(warnIfUnseen, MIC_UNSEEN_MS);
        refreshMute();
      },
    };
  };
  const mic = watch("du micro", deps.micName);
  const desktop = watch("du son du PC", deps.desktopName);

  // La diffusion : son état part aux abonnés à la connexion (le serveur peut démarrer en plein live), puis à chaque démarrage
  // ou arrêt.
  const broadcastListeners = new Set<(broadcast: Broadcast) => void>();
  const emitBroadcast = (broadcast: Broadcast) => {
    for (const listener of broadcastListeners) listener(broadcast);
  };
  const refreshBroadcast = async () => {
    try {
      const { isLive, durationMs } = await socket.getStreamStatus();
      emitBroadcast({ isLive, duration: durationMs });
    } catch (error) {
      log(`Diffusion : état d'OBS illisible, ${error instanceof Error ? error.message : error}`);
    }
  };

  const replayListeners = new Set<(event: { path: string }) => void>();
  socket.onReplaySaved((path) => {
    for (const listener of replayListeners) listener({ path });
  });

  // La page /show est à l'antenne quand une source navigateur vers /show est visible dans la scène du programme (scènes et groupes
  // compris). OBS est interrogé après chaque évènement utile, et seul un changement part aux abonnés ; une connexion perdue la retire.
  const showListeners = new Set<(isVisible: boolean) => void>();
  let isShowVisible = false;
  let isShowFailureLogged = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  const emitShow = (isVisible: boolean) => {
    if (isVisible === isShowVisible) return;
    isShowVisible = isVisible;
    for (const listener of showListeners) listener(isVisible);
  };
  const refreshShow = async () => {
    try {
      const names = new Set(
        (await socket.listPages()).filter((page) => isShowPage(page.url, pageHosts)).map(({ name }) => name),
      );
      const scene = { name: await socket.getProgramScene(), isGroup: false };
      emitShow(names.size > 0 && (await hasVisibleSource(socket, scene, names, 0)));
    } catch (error) {
      if (isShowFailureLogged) return;
      isShowFailureLogged = true;
      log(
        `Émission : la scène du programme est illisible, ${error instanceof Error ? error.message : error}`,
      );
    }
  };
  const scheduleShowRefresh = () => {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => void refreshShow(), SCENE_SETTLE_MS);
  };
  socket.onSceneChanged(scheduleShowRefresh);

  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(giveUpTimer);
    clearTimeout(showTimer);
    mic.disarm();
    desktop.disarm();
  };

  const exit = (reason: string) => {
    isStopped = true;
    clearTimers();
    onExit(reason);
  };

  const refreshPages = async () => {
    try {
      for (const page of (await socket.listPages()).filter((candidate) =>
        isOwnPage(candidate.url, pageHosts),
      )) {
        await socket.refreshPage(page.name);
        log(`Source navigateur « ${page.name} » rafraîchie.`);
      }
    } catch (error) {
      log(
        `Rafraîchissement des sources navigateur impossible : ${error instanceof Error ? error.message : error}`,
      );
    }
  };

  const scheduleRetry = () => {
    retryTimer = setTimeout(connect, RETRY_MS);
  };

  const onConnected = (version: string) => {
    hasConnected = true;
    isLinked = true;
    clearTimeout(giveUpTimer);
    log(`Connecté à OBS ${address} (obs-websocket ${version}).`);
    mic.arm();
    desktop.arm();
    void refreshBroadcast();
    void refreshPages();
    scheduleShowRefresh();
  };

  const onFailed = (connection: { isPasswordRefused: boolean }) => {
    if (connection.isPasswordRefused && !isRefusedLogged) {
      isRefusedLogged = true;
      log("Mot de passe OBS refusé, voir .env (OBS_PASSWORD). Nouvel essai toutes les 2 s.");
    } else if (!connection.isPasswordRefused && !hasConnected && !isUnreachableLogged) {
      isUnreachableLogged = true;
      log(`OBS ne répond pas sur ${address} : nouvel essai toutes les 2 s, sans limite.`);
    }
    scheduleRetry();
  };

  async function connect() {
    const connection = await socket.connect();
    if (isStopped) return;
    if (connection.ok) onConnected(connection.version);
    else onFailed(connection);
  }

  socket.onExitStarted(() => exit("OBS se ferme : arrêt du serveur."));

  socket.onStreamState((isLive) => emitBroadcast({ isLive, duration: 0 }));

  socket.onInputMute((inputName, isMuted) => {
    mic.mute(inputName, isMuted);
    desktop.mute(inputName, isMuted);
  });

  socket.onClosed(() => {
    // Un essai de connexion qui échoue ferme aussi le socket : c'est `connect` qui le traite, pas ici.
    if (!isLinked || isStopped) return;
    isLinked = false;
    mic.disarm();
    desktop.disarm();
    clearTimeout(showTimer);
    emitShow(false);
    log("Connexion à OBS perdue : nouvel essai toutes les 2 s, arrêt du serveur dans 30 s sans retour.");
    giveUpTimer = setTimeout(() => exit("OBS ne revient pas depuis 30 s : arrêt du serveur."), GIVE_UP_MS);
    scheduleRetry();
  });

  socket.onLevels((inputs) => {
    for (const input of inputs) {
      namesSeen.add(input.name);
      mic.hear(input);
      desktop.hear(input);
    }
  });

  return {
    mic: mic.port,
    desktop: desktop.port,
    broadcast: {
      subscribe(listener) {
        broadcastListeners.add(listener);
        return () => {
          broadcastListeners.delete(listener);
        };
      },
    },
    replay: {
      subscribe(listener) {
        replayListeners.add(listener);
        return () => {
          replayListeners.delete(listener);
        };
      },
    },
    show: {
      subscribe(listener) {
        showListeners.add(listener);
        return () => {
          showListeners.delete(listener);
        };
      },
    },
    updateMicName: mic.rename,
    updateDesktopName: desktop.rename,
    getStatus: () => ({ isLinked, inputNames: [...namesSeen].sort() }),
    start() {
      void connect();
    },
    stop() {
      isStopped = true;
      clearTimers();
    },
  };
}
