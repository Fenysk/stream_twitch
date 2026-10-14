import OBSWebSocket, { EventSubscription, OBSWebSocketError } from "obs-websocket-js/json";
import { z } from "zod";
import { toLevel } from "../domain/mic.rules";
import type { DesktopPort } from "../usecase/fox-balance.usecase";
import type { Broadcast, BroadcastPort } from "../usecase/fox-hours.usecase";
import type { MicPort } from "../usecase/head.usecase";

const PASSWORD_REFUSED_CODE = 4009;
const RETRY_MS = 2000;
const GIVE_UP_MS = 30_000;
const MIC_UNSEEN_MS = 5000;

export type ObsInputPeaks = { name: string; peaks: number[] };
export type ObsPage = { name: string; url: string | undefined };
export type ObsConnection =
  | { ok: true; version: string }
  | { ok: false; isPasswordRefused: boolean; reason: string };

// Ce que le client attend d'OBS ; `createObsSocket` l'implémente avec obs-websocket-js, les tests avec un faux.
export type ObsSocket = {
  connect(): Promise<ObsConnection>;
  listPages(): Promise<ObsPage[]>;
  refreshPage(name: string): Promise<void>;
  onLevels(listener: (inputs: ObsInputPeaks[]) => void): void;
  // L'état de la diffusion à l'instant : en direct ou non, et depuis combien de ms.
  getStreamStatus(): Promise<{ isLive: boolean; durationMs: number }>;
  // La diffusion démarre (`true`) ou s'arrête (`false`) ; ses autres états (démarrage, coupure réseau) ne comptent pas.
  onStreamState(listener: (isLive: boolean) => void): void;
  onExitStarted(listener: () => void): void;
  onClosed(listener: () => void): void;
};

const MetersSchema = z.object({
  inputs: z.array(z.object({ inputName: z.string(), inputLevelsMul: z.array(z.array(z.number())) })),
});

// GetStreamStatus : `outputDuration` est en ms. StreamStateChanged : OBS_WEBSOCKET_OUTPUT_STARTED, _STOPPED (et _STARTING,
// _STOPPING, _RECONNECTING, _RECONNECTED, que le renard laisse de côté : une coupure réseau garde la durée).
const StreamStatusSchema = z.object({ outputActive: z.boolean(), outputDuration: z.number() });
const StreamStateSchema = z.object({ outputState: z.string() });
const STREAM_STARTED = "OBS_WEBSOCKET_OUTPUT_STARTED";
const STREAM_STOPPED = "OBS_WEBSOCKET_OUTPUT_STOPPED";

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
    let timer: ReturnType<typeof setTimeout> | undefined;

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
        const level = toLevel(input.peaks);
        for (const listener of listeners) listener(level);
      },
      rename(next: string | undefined) {
        if (next === name) return;
        name = next;
        isSeen = false;
        isWarned = false;
        clearTimeout(timer);
        if (next === undefined) return;
        log(`Entrée ${label} changée : « ${next} ».`);
        if (isLinked) timer = setTimeout(warnIfUnseen, MIC_UNSEEN_MS);
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

  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(giveUpTimer);
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

  socket.onClosed(() => {
    // Un essai de connexion qui échoue ferme aussi le socket : c'est `connect` qui le traite, pas ici.
    if (!isLinked || isStopped) return;
    isLinked = false;
    mic.disarm();
    desktop.disarm();
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
