import OBSWebSocket, { EventSubscription, OBSWebSocketError } from "obs-websocket-js/json";
import { z } from "zod";
import { toLevel } from "../domain/mic.rules";
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
  onExitStarted(listener: () => void): void;
  onClosed(listener: () => void): void;
};

const MetersSchema = z.object({
  inputs: z.array(z.object({ inputName: z.string(), inputLevelsMul: z.array(z.array(z.number())) })),
});

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
  pageHosts: string[];
  log: (message: string) => void;
  onExit: (reason: string) => void;
};

export type ObsClient = { mic: MicPort; start(): void; stop(): void };

export function createObsClient(deps: ObsClientDeps, socket: ObsSocket): ObsClient {
  const { address, micName, pageHosts, log, onExit } = deps;
  const listeners = new Set<(level: number) => void>();
  const namesSeen = new Set<string>();
  let hasConnected = false;
  let isLinked = false;
  let isStopped = false;
  let isRefusedLogged = false;
  let isUnreachableLogged = false;
  let isMicSeen = false;
  let isMicWarned = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  let micTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(giveUpTimer);
    clearTimeout(micTimer);
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

  const warnIfMicUnseen = () => {
    if (isMicSeen || isMicWarned) return;
    isMicWarned = true;
    const names = [...namesSeen].map((name) => `« ${name} »`).join(", ") || "(aucune)";
    log(
      `Attention : l'entrée « ${micName} » n'est dans aucun évènement reçu depuis 5 s, le niveau reste à zéro. Entrées reçues : ${names}. Vérifier micName dans settings.json.`,
    );
  };

  const scheduleRetry = () => {
    retryTimer = setTimeout(connect, RETRY_MS);
  };

  const onConnected = (version: string) => {
    hasConnected = true;
    isLinked = true;
    clearTimeout(giveUpTimer);
    log(`Connecté à OBS ${address} (obs-websocket ${version}).`);
    log(`Abonné au niveau du micro « ${micName} » (InputVolumeMeters, toutes les 50 ms).`);
    micTimer = setTimeout(warnIfMicUnseen, MIC_UNSEEN_MS);
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

  socket.onClosed(() => {
    // Un essai de connexion qui échoue ferme aussi le socket : c'est `connect` qui le traite, pas ici.
    if (!isLinked || isStopped) return;
    isLinked = false;
    clearTimeout(micTimer);
    log("Connexion à OBS perdue : nouvel essai toutes les 2 s, arrêt du serveur dans 30 s sans retour.");
    giveUpTimer = setTimeout(() => exit("OBS ne revient pas depuis 30 s : arrêt du serveur."), GIVE_UP_MS);
    scheduleRetry();
  });

  socket.onLevels((inputs) => {
    for (const input of inputs) {
      namesSeen.add(input.name);
      if (input.name !== micName) continue;
      if (!isMicSeen) {
        isMicSeen = true;
        log(`Niveau du micro « ${micName} » reçu.`);
      }
      const level = toLevel(input.peaks);
      for (const listener of listeners) listener(level);
    }
  });

  return {
    mic: {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    start() {
      void connect();
    },
    stop() {
      isStopped = true;
      clearTimers();
    },
  };
}
