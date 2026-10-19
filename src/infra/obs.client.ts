import OBSWebSocket, { EventSubscription, OBSWebSocketError } from "obs-websocket-js/json";
import { z } from "zod";
import { toCameraOfAddress } from "../domain/camera.rules";
import { toLevel } from "../domain/mic.rules";
import {
  type ObsPictureMember,
  type PictureItem,
  toObsPicture,
  toPicturePlan,
  toPictureSources,
} from "../domain/picture.rules";
import { fromBase64 } from "../shared/base64";
import type { BoostFilters, CameraBoostPort, LevelsPort } from "../usecase/camera-boost.usecase";
import type { ReplayPort } from "../usecase/clip-chat.usecase";
import { OBS_OFFLINE, type ObsControlPort, type ObsControlState } from "../usecase/control.usecase";
import type { DesktopPort } from "../usecase/fox-balance.usecase";
import type { Broadcast, BroadcastPort } from "../usecase/fox-hours.usecase";
import type { MicPort } from "../usecase/head.usecase";
import type { MonitorPort, MonitorShot } from "../usecase/monitor.usecase";
import type { ShowScenePort, ShowSceneResult } from "../usecase/show-director.usecase";

// Les filtres que l'appli pose sur la source d'une caméra : un filtre de boost (réglé de 0 à 30 dB, `boost.rules.ts`) et un limiteur vers -3 dB, après lui.
// Les noms disent qui les a posés ; un limiteur d'Alexis, quel que soit son nom, dispense de poser celui-ci.
const BOOST_FILTER_NAME = "Gain (appli)";
const BOOST_FILTER_KIND = "gain_filter";
const LIMITER_FILTER_NAME = "Limiteur (appli)";
const LIMITER_FILTER_KIND = "limiter_filter";
const LIMITER_THRESHOLD_DB = -3;

// Le retour antenne : une seule taille (la capture est partagée entre les téléphones), en JPEG ; OBS garde les proportions.
const MONITOR_WIDTH = 640;
// obs-websocket v5 rend un data URI complet (`data:image/jpg;base64,…`), pas le base64 seul.
const IMAGE_URI_PREFIX = /^data:[^,]*,/;

const PASSWORD_REFUSED_CODE = 4009;
const RETRY_MS = 2000;
const GIVE_UP_MS = 30_000;
const MIC_UNSEEN_MS = 5000;

export type ObsInputPeaks = { name: string; peaks: number[] };
// Un filtre d'une source tel qu'OBS le garde (GetSourceFilterList) : son nom, son genre (`gain_filter`, `limiter_filter`) et ses réglages.
export type ObsFilter = { name: string; kind: string; settings: Record<string, unknown> };
// Les réglages que l'appli écrit dans un filtre.
export type ObsFilterSettings = Record<string, number | string | boolean>;
export type ObsPage = { name: string; url: string | undefined };
// Ce qu'une scène (ou un groupe) contient : une source, une autre scène ou un groupe, et si cet élément est visible dans elle.
export type ObsSceneItem = { name: string; kind: "input" | "scene" | "group"; isEnabled: boolean };
export type ObsConnection =
  | { ok: true; version: string }
  | { ok: false; isPasswordRefused: boolean; reason: string };
// Les scènes d'OBS, ou pourquoi on ne les a pas (OBS non joint, demande en échec).
export type ObsSceneList = { ok: true; scenes: string[] } | { ok: false; reason: string };

// Ce que le client attend d'OBS ; `createObsSocket` l'implémente avec obs-websocket-js, les tests avec un faux.
export type ObsSocket = {
  connect(): Promise<ObsConnection>;
  listPages(): Promise<ObsPage[]>;
  refreshPage(name: string): Promise<void>;
  // La scène du programme (celle qui passe à l'antenne, pas l'aperçu du mode studio).
  getProgramScene(): Promise<string>;
  // Les noms des scènes, dans l'ordre d'OBS.
  listScenes(): Promise<string[]>;
  // La scène du programme devient celle-ci (SetCurrentProgramScene, aussi en mode studio) ; une scène inconnue fait échouer la demande.
  updateProgramScene(name: string): Promise<void>;
  // Les éléments d'une scène, ou d'un groupe (`isGroup`), tels qu'OBS les range.
  listSceneItems(sceneName: string, isGroup: boolean): Promise<ObsSceneItem[]>;
  // Les éléments de la place caméra (une scène), avec leur identifiant dans la scène et le genre de leur source ; une scène inconnue
  // fait échouer la demande.
  listPictureItems(sceneName: string): Promise<PictureItem[]>;
  // Montre (`true`) ou cache (`false`) un élément d'une scène (SetSceneItemEnabled).
  updateSceneItemEnabled(sceneName: string, itemId: number, isEnabled: boolean): Promise<void>;
  // Les filtres d'une source, dans l'ordre d'OBS ; une source inconnue fait échouer la demande.
  listFilters(sourceName: string): Promise<ObsFilter[]>;
  // Ajoute un filtre à la fin de ceux d'une source (CreateSourceFilter) ; un nom déjà pris fait échouer la demande.
  createFilter(
    sourceName: string,
    filterName: string,
    filterKind: string,
    filterSettings: ObsFilterSettings,
  ): Promise<void>;
  // Change des réglages d'un filtre, les autres restent (SetSourceFilterSettings avec `overlay`).
  updateFilterSettings(
    sourceName: string,
    filterName: string,
    filterSettings: ObsFilterSettings,
  ): Promise<void>;
  // Quelque chose a changé qui peut changer ce que le programme montre : la scène du programme, la visibilité d'un élément, une
  // source ou une scène créée, retirée, renommée, l'adresse d'une source navigateur.
  onSceneChanged(listener: () => void): void;
  onLevels(listener: (inputs: ObsInputPeaks[]) => void): void;
  // L'entrée est-elle coupée à l'instant ? Une entrée inconnue d'OBS fait échouer la demande.
  getInputMute(name: string): Promise<boolean>;
  // Une entrée est coupée (`true`) ou rouverte (`false`).
  onInputMute(listener: (name: string, isMuted: boolean) => void): void;
  // Coupe (`true`) ou rouvre (`false`) l'entrée (SetInputMute) ; une entrée inconnue d'OBS fait échouer la demande.
  updateInputMute(name: string, isMuted: boolean): Promise<void>;
  // L'état de la diffusion à l'instant : en direct ou non, et depuis combien de ms.
  getStreamStatus(): Promise<{ isLive: boolean; durationMs: number }>;
  // Arrête la diffusion (StopStream) ; OBS refuse quand elle n'est pas en cours.
  stopStream(): Promise<void>;
  // Une image JPEG de cette source ou scène, de cette largeur (GetSourceScreenshot) : son data URI, tel qu'OBS le rend ; une source
  // inconnue fait échouer la demande.
  getSourceScreenshot(sourceName: string, width: number): Promise<string>;
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
// GetSourceScreenshot : `imageData` est l'image encodée en data URI.
const ScreenshotSchema = z.object({ imageData: z.string() });
// ReplayBufferSaved : `savedReplayPath` est le fichier que le tampon de relecture vient d'écrire.
const ReplaySavedSchema = z.object({ savedReplayPath: z.string() });
const STREAM_STARTED = "OBS_WEBSOCKET_OUTPUT_STARTED";
const STREAM_STOPPED = "OBS_WEBSOCKET_OUTPUT_STOPPED";

// GetCurrentProgramScene : `sceneName` (obs-websocket 5.4+), `currentProgramSceneName` avant.
const ProgramSceneSchema = z.object({
  sceneName: z.string().optional(),
  currentProgramSceneName: z.string().optional(),
});
// GetSceneList : `sceneIndex` est la place de la scène dans OBS.
const SceneListSchema = z.object({
  scenes: z.array(z.object({ sceneName: z.string(), sceneIndex: z.number().optional() })),
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
// GetSourceFilterList : le nom, le genre et les réglages de chaque filtre.
const FiltersSchema = z.object({
  filters: z.array(
    z.object({
      filterName: z.string(),
      filterKind: z.string(),
      filterSettings: z.record(z.string(), z.unknown()),
    }),
  ),
});
// GetSceneItemList, pour la place caméra : `sceneItemId` nomme l'élément dans sa scène, `inputKind` le genre de sa source (nul pour une scène).
const PictureItemsSchema = z.object({
  sceneItems: z.array(
    z.object({
      sceneItemId: z.number().int(),
      sourceName: z.string(),
      sourceType: z.string(),
      inputKind: z.string().nullable().optional(),
      sceneItemEnabled: z.boolean(),
      isGroup: z.boolean().nullable().optional(),
    }),
  ),
});

// Les noms des scènes d'une réponse GetSceneList, rangés par `sceneIndex` (l'ordre reçu quand OBS ne le donne pas).
export const toSceneNames = (answer: unknown): string[] =>
  [...SceneListSchema.parse(answer).scenes]
    .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0))
    .map(({ sceneName }) => sceneName);

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
    async listScenes() {
      return toSceneNames(await obs.call("GetSceneList"));
    },
    async updateProgramScene(name) {
      await obs.call("SetCurrentProgramScene", { sceneName: name });
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
    async listPictureItems(sceneName) {
      const answer = PictureItemsSchema.parse(await obs.call("GetSceneItemList", { sceneName }));
      return answer.sceneItems.map((item) => ({
        id: item.sceneItemId,
        name: item.sourceName,
        kind: toSceneItemKind(item.sourceType, item.isGroup),
        inputKind: item.inputKind ?? null,
        isEnabled: item.sceneItemEnabled,
      }));
    },
    async updateSceneItemEnabled(sceneName, itemId, isEnabled) {
      await obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId: itemId,
        sceneItemEnabled: isEnabled,
      });
    },
    async listFilters(sourceName) {
      const answer = FiltersSchema.parse(await obs.call("GetSourceFilterList", { sourceName }));
      return answer.filters.map((filter) => ({
        name: filter.filterName,
        kind: filter.filterKind,
        settings: filter.filterSettings,
      }));
    },
    async createFilter(sourceName, filterName, filterKind, filterSettings) {
      await obs.call("CreateSourceFilter", { sourceName, filterName, filterKind, filterSettings });
    },
    async updateFilterSettings(sourceName, filterName, filterSettings) {
      await obs.call("SetSourceFilterSettings", { sourceName, filterName, filterSettings, overlay: true });
    },
    onSceneChanged(listener) {
      const notify = () => listener();
      obs.on("CurrentProgramSceneChanged", notify);
      obs.on("SceneItemEnableStateChanged", notify);
      obs.on("SceneItemCreated", notify);
      obs.on("SceneCreated", notify);
      obs.on("InputCreated", notify);
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
    async updateInputMute(name, isMuted) {
      await obs.call("SetInputMute", { inputName: name, inputMuted: isMuted });
    },
    async getStreamStatus() {
      const status = StreamStatusSchema.parse(await obs.call("GetStreamStatus"));
      return { isLive: status.outputActive, durationMs: status.outputDuration };
    },
    async stopStream() {
      await obs.call("StopStream");
    },
    async getSourceScreenshot(sourceName, width) {
      const answer = await obs.call("GetSourceScreenshot", {
        sourceName,
        imageFormat: "jpg",
        imageWidth: width,
        imageCompressionQuality: 60,
      });
      return ScreenshotSchema.parse(answer).imageData;
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

// Une page que ce serveur sert : celle de l'un de ses hôtes, ou d'un sous-domaine de l'un d'eux sur le même port. Les pages des caméras
// (`camera-1.localhost:4747`) et le décompte (`countdown.localhost:4747`) ont leur propre hôte pour ne pas se partager les 6 connexions
// d'OBS : `*.localhost` mène à ce serveur, mais un autre port ou un autre site n'est pas le sien.
export function isServedPage(url: string | undefined, hosts: string[]): boolean {
  if (url === undefined || !URL.canParse(url)) return false;
  const { host } = new URL(url);
  return hosts.some((own) => host === own || host.endsWith(`.${own}`));
}

// La page de l'émission : une page du serveur dont le chemin est /show.
export function isShowPage(url: string | undefined, hosts: string[]): boolean {
  return url !== undefined && isOwnPage(url, hosts) && new URL(url).pathname.replace(/\/+$/, "") === "/show";
}

type CameraSource = { number: number; input: string };

// Toutes les sources navigateur qui sont la page d'une caméra (`/camera/<numéro>` sur l'hôte de cette caméra) : leur numéro et le nom
// de l'entrée d'OBS. Un numéro peut avoir plusieurs sources.
export function toCameraSources(pages: readonly ObsPage[], hosts: string[]): CameraSource[] {
  return pages.flatMap(({ name, url }) => {
    const number = toCameraOfAddress(url, hosts);
    return number === null ? [] : [{ number, input: name }];
  });
}

// Les mêmes, la première source de chaque numéro : c'est son entrée audio.
export function toCameraPages(pages: readonly ObsPage[], hosts: string[]): CameraSource[] {
  const found = toCameraSources(pages, hosts);
  return found.filter(({ number }, index) => found.findIndex((other) => other.number === number) === index);
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
  // La scène d'OBS qui est la place caméra (`cameraSlotScene`) ; absente, il n'y a pas d'image à choisir.
  cameraSlotScene?: string | undefined;
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
  // La page /show à l'antenne ou non, et la scène où OBS passe à la fin de l'émission.
  show: ShowScenePort;
  // La régie du téléphone : la scène du programme, les scènes, les coupures des micros (celui du PC et la source de chaque caméra),
  // et de quoi passer une scène à l'antenne ou couper une entrée.
  control: ObsControlPort;
  // Les levels (dB) de toutes les entrées audio d'OBS, lus dans InputVolumeMeters, et les filtres de boost des sources de caméra.
  levels: LevelsPort;
  boost: CameraBoostPort;
  // Le retour antenne : l'image de la scène du programme, que la régie montre en vignette puis en grand.
  monitor: MonitorPort;
  // Les noms des scènes d'OBS dans son ordre ; OBS non joint : le refus à montrer.
  listScenes(): Promise<ObsSceneList>;
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
  const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  const listScenes = async (): Promise<ObsSceneList> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      return { ok: true, scenes: await socket.listScenes() };
    } catch (error) {
      return { ok: false, reason: `les scènes d'OBS sont illisibles, ${toReason(error)}` };
    }
  };
  // Une scène inconnue est refusée d'avance : le refus d'OBS, en anglais, ne dirait pas laquelle.
  const updateProgramScene = async (name: string): Promise<ShowSceneResult> => {
    const listed = await listScenes();
    if (!listed.ok) return listed;
    if (!listed.scenes.includes(name))
      return { ok: false, reason: `la scène « ${name} » n'existe pas dans OBS` };
    try {
      await socket.updateProgramScene(name);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toReason(error) };
    }
  };
  const scheduleShowRefresh = () => {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => void refreshShow(), SCENE_SETTLE_MS);
  };
  socket.onSceneChanged(scheduleShowRefresh);

  // La régie : ce qui peut changer son état (la scène, les scènes, une source, une coupure, OBS joint ou perdu) la prévient, 150 ms
  // après le dernier évènement ; elle relit alors OBS en entier.
  const controlListeners = new Set<() => void>();
  let controlTimer: ReturnType<typeof setTimeout> | undefined;
  let isControlFailureLogged = false;
  const scheduleControlRefresh = () => {
    clearTimeout(controlTimer);
    controlTimer = setTimeout(() => {
      for (const listener of controlListeners) listener();
    }, SCENE_SETTLE_MS);
  };
  socket.onSceneChanged(scheduleControlRefresh);
  socket.onInputMute(scheduleControlRefresh);

  // Une entrée inconnue d'OBS, ou qu'il refuse de dire : pas de coupure connue.
  const getMute = (name: string): Promise<boolean | null> => socket.getInputMute(name).catch(() => null);
  // Les caméras à l'antenne : celles dont une source (une caméra peut en avoir plusieurs) est visible dans la scène du programme.
  const listOnAir = async (scene: string, sources: readonly CameraSource[]): Promise<number[]> => {
    const numbers = [...new Set(sources.map(({ number }) => number))];
    const answers = await Promise.all(
      numbers.map((number) => {
        const names = new Set(sources.filter((source) => source.number === number).map(({ input }) => input));
        return hasVisibleSource(socket, { name: scene, isGroup: false }, names, 0);
      }),
    );
    return numbers.filter((_, index) => answers[index]);
  };
  // La place caméra : ses éléments avec l'adresse de chaque source navigateur d'OBS, rangés en membres (le PC, la tête, les caméras).
  const listPictureSources = async (scene: string, pages: readonly ObsPage[]) =>
    toPictureSources(
      await socket.listPictureItems(scene),
      new Map(pages.map(({ name, url }) => [name, url])),
      pageHosts,
    );
  // Une place illisible (la scène n'existe pas, OBS refuse) n'ôte rien d'autre à la régie : pas d'image à choisir, dit une seule fois.
  let isPictureFailureLogged = false;
  const getPicture = async (pages: readonly ObsPage[]): Promise<ObsPictureMember[]> => {
    const scene = deps.cameraSlotScene;
    if (scene === undefined) return [];
    try {
      return toObsPicture(await listPictureSources(scene, pages));
    } catch (error) {
      if (!isPictureFailureLogged) {
        isPictureFailureLogged = true;
        log(`Régie : la place caméra « ${scene} » est illisible, ${toReason(error)}`);
      }
      return [];
    }
  };
  const getControlState = async (pcMic: string): Promise<ObsControlState> => {
    if (!isLinked) return OBS_OFFLINE;
    try {
      const [scene, scenes, pages] = await Promise.all([
        socket.getProgramScene(),
        socket.listScenes(),
        socket.listPages(),
      ]);
      const found = toCameraPages(pages, pageHosts);
      const onAir = await listOnAir(scene, toCameraSources(pages, pageHosts));
      const picture = await getPicture(pages);
      const [isPcMuted = null, ...mutes] = await Promise.all([
        getMute(pcMic),
        ...found.map(({ input }) => getMute(input)),
      ]);
      const cameras = found.flatMap((page, index) => {
        const isMuted = mutes[index];
        return typeof isMuted === "boolean" ? [{ ...page, isMuted }] : [];
      });
      return { isLinked: true, scene, scenes, isPcMuted, cameras, onAir, picture };
    } catch (error) {
      if (!isControlFailureLogged) {
        isControlFailureLogged = true;
        log(`Régie : l'état d'OBS est illisible, ${toReason(error)}`);
      }
      return { ...OBS_OFFLINE, isLinked: true };
    }
  };
  const updateInputMute = async (input: string, isMuted: boolean): Promise<ShowSceneResult> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      await socket.updateInputMute(input, isMuted);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: `OBS refuse de ${isMuted ? "couper" : "rouvrir"} l'entrée « ${input} » (${toReason(error)})`,
      };
    }
  };

  // Le membre est seul à l'image : OBS relit la place, les éléments de ce membre qui sont cachés se montrent d'abord (aucun instant sans
  // image), puis ceux des autres membres qui sont visibles se cachent. Rien d'autre dans la scène n'est touché.
  const updatePicture = async (id: string): Promise<ShowSceneResult> => {
    const scene = deps.cameraSlotScene;
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    if (scene === undefined)
      return { ok: false, reason: "cameraSlotScene n'est pas réglé dans settings.json" };
    try {
      const plan = toPicturePlan(await listPictureSources(scene, await socket.listPages()), id);
      if (!plan) return { ok: false, reason: `la scène « ${scene} » ne contient pas ce membre` };
      for (const item of plan.show) await socket.updateSceneItemEnabled(scene, item, true);
      for (const item of plan.hide) await socket.updateSceneItemEnabled(scene, item, false);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `OBS refuse de changer l'image (${toReason(error)})` };
    }
  };

  // Le boost d'une caméra : son filtre de boost et son limiteur se posent s'ils n'existent pas, une seule fois ; ce qui existe déjà ne
  // change pas (un filtre de boost déjà réglé donne son boost de départ, un limiteur d'Alexis dispense du nôtre).
  const createFilters = async (input: string): Promise<BoostFilters> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      const filters = await socket.listFilters(input);
      const boost = filters.find(({ name }) => name === BOOST_FILTER_NAME);
      if (!boost) await socket.createFilter(input, BOOST_FILTER_NAME, BOOST_FILTER_KIND, { db: 0 });
      if (!filters.some(({ kind }) => kind === LIMITER_FILTER_KIND)) {
        await socket.createFilter(input, LIMITER_FILTER_NAME, LIMITER_FILTER_KIND, {
          threshold: LIMITER_THRESHOLD_DB,
        });
      }
      const db = boost?.settings.db;
      return { ok: true, boostDb: typeof db === "number" ? db : 0 };
    } catch (error) {
      return { ok: false, reason: `OBS refuse de poser les filtres de « ${input} » (${toReason(error)})` };
    }
  };
  const updateBoost = async (input: string, boostDb: number): Promise<ShowSceneResult> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      await socket.updateFilterSettings(input, BOOST_FILTER_NAME, { db: boostDb });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `OBS refuse de régler le boost de « ${input} » (${toReason(error)})` };
    }
  };

  const stopStream = async (): Promise<ShowSceneResult> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      await socket.stopStream();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `OBS refuse d'arrêter le live (${toReason(error)})` };
    }
  };

  const getMonitorImage = async (scene: string): Promise<MonitorShot> => {
    if (!isLinked) return { ok: false, reason: "OBS n'est pas connecté" };
    try {
      const text = (await socket.getSourceScreenshot(scene, MONITOR_WIDTH)).replace(IMAGE_URI_PREFIX, "");
      const bytes = fromBase64(text);
      if (bytes === undefined || bytes.length === 0)
        return { ok: false, reason: "OBS rend une image illisible" };
      return { ok: true, bytes };
    } catch (error) {
      return { ok: false, reason: `OBS ne capture pas la scène « ${scene} » (${toReason(error)})` };
    }
  };

  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(giveUpTimer);
    clearTimeout(showTimer);
    clearTimeout(controlTimer);
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
        isServedPage(candidate.url, pageHosts),
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
    scheduleControlRefresh();
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
    scheduleControlRefresh();
    log("Connexion à OBS perdue : nouvel essai toutes les 2 s, arrêt du serveur dans 30 s sans retour.");
    giveUpTimer = setTimeout(() => exit("OBS ne revient pas depuis 30 s : arrêt du serveur."), GIVE_UP_MS);
    scheduleRetry();
  });

  // Les levels de toutes les entrées, pour ceux qui en suivent une (le boost d'une caméra) : le calcul n'a lieu que s'il y en a.
  const levelListeners = new Set<(input: string, level: number) => void>();
  socket.onLevels((inputs) => {
    for (const input of inputs) {
      namesSeen.add(input.name);
      if (levelListeners.size > 0) {
        const level = toLevel(input.peaks);
        for (const listener of levelListeners) listener(input.name, level);
      }
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
      updateProgramScene,
    },
    control: {
      subscribe(listener) {
        controlListeners.add(listener);
        return () => {
          controlListeners.delete(listener);
        };
      },
      getState: getControlState,
      updateProgramScene,
      updateInputMute,
      stopStream,
      updatePicture,
    },
    levels: {
      subscribe(listener) {
        levelListeners.add(listener);
        return () => {
          levelListeners.delete(listener);
        };
      },
    },
    boost: { createFilters, updateBoost },
    monitor: { getImage: getMonitorImage },
    listScenes,
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
