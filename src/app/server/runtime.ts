import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { toChatChannel } from "../../domain/chat-settings.rules";
import type { ExpressionRef } from "../../domain/head.types";
import { toInstant } from "../../domain/instant.rules";
import { toNamedSettings } from "../../domain/obs-ids.rules";
import type { Settings } from "../../domain/settings.schema";
import { toClipCounts } from "../../domain/sound.rules";
import { isFlinchReward, isFoxReward } from "../../domain/thanks.rules";
import { createChatClient } from "../../infra/chat.client";
import { createClipChatStore, createClipStore } from "../../infra/clip.repository";
import { createEmoteClient } from "../../infra/emotes.client";
import { createEmoteStore } from "../../infra/emotes.repository";
import { createExpressionStore } from "../../infra/expression.repository";
import { createFfmpegClient, createProcessRunner } from "../../infra/ffmpeg.client";
import { getHeadFiles } from "../../infra/head-files.repository";
import { getInsults } from "../../infra/insults.repository";
import {
  deleteLocalSettings,
  getLocalSettings,
  updateLocalSettings,
  upgradeLocalSettings,
} from "../../infra/local-settings.repository";
import { createObsClient, createObsSocket, type ObsClient } from "../../infra/obs.client";
import { createObsIdsStore } from "../../infra/obs-ids.repository";
import { createRegularsStore } from "../../infra/regulars.repository";
import { createRewardStore } from "../../infra/reward.repository";
import { createRewardPhraseStore } from "../../infra/reward-phrase.repository";
import { getSettings } from "../../infra/settings.repository";
import { createSoundStore, upgradeSounds } from "../../infra/sound.repository";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import { createChatWriterClient } from "../../infra/twitch-chat.client";
import { createChatViewersClient } from "../../infra/twitch-chat-viewers.client";
import { createEventFeed } from "../../infra/twitch-events.client";
import { createRewardsClient } from "../../infra/twitch-rewards.client";
import { createTimetableClient } from "../../infra/twitch-timetable.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import { createViewersClient } from "../../infra/twitch-viewers.client";
import { createPowerShellRunner, createVoiceClient, sweepVoiceFiles } from "../../infra/voice.client";
import { createCameraBoost } from "../../usecase/camera-boost.usecase";
import { type Chat, createChat } from "../../usecase/chat.usecase";
import { type ClipLibrary, createClipLibrary } from "../../usecase/clip.usecase";
import { createClipAnalysis } from "../../usecase/clip-analysis.usecase";
import { createClipChat } from "../../usecase/clip-chat.usecase";
import { type Control, createControl } from "../../usecase/control.usecase";
import { createEmoteSync } from "../../usecase/emote-sync.usecase";
import { createExpressionLibrary, type ExpressionLibrary } from "../../usecase/expression.usecase";
import { createFox, type Fox } from "../../usecase/fox.usecase";
import { createFoxAttitude } from "../../usecase/fox-attitude.usecase";
import { createFoxBalance } from "../../usecase/fox-balance.usecase";
import { createFoxChat } from "../../usecase/fox-chat.usecase";
import { createFoxComeback } from "../../usecase/fox-comeback.usecase";
import { createFoxEndReset } from "../../usecase/fox-end-reset.usecase";
import { createFoxHours } from "../../usecase/fox-hours.usecase";
import { createFoxJab } from "../../usecase/fox-jab.usecase";
import { createFoxMode, type FoxModeController } from "../../usecase/fox-mode.usecase";
import { createFoxQueue } from "../../usecase/fox-queue.usecase";
import { createFoxRegulars } from "../../usecase/fox-regulars.usecase";
import { createFoxReview, type FoxReview } from "../../usecase/fox-review.usecase";
import { createFoxReward, type FoxReward } from "../../usecase/fox-reward.usecase";
import { createFoxShout } from "../../usecase/fox-shout.usecase";
import { createFoxStartle } from "../../usecase/fox-startle.usecase";
import { createFoxTally } from "../../usecase/fox-tally.usecase";
import { createFoxThanks, type FoxThanks } from "../../usecase/fox-thanks.usecase";
import { createFoxTunnel } from "../../usecase/fox-tunnel.usecase";
import { createHeadLoop, type HeadFeed } from "../../usecase/head.usecase";
import { createMonitor, type Monitor } from "../../usecase/monitor.usecase";
import { createObsIds } from "../../usecase/obs-ids.usecase";
import { createPhones, type Phones } from "../../usecase/phone.usecase";
import { createRewardLibrary, type RewardLibrary } from "../../usecase/reward.usecase";
import { createRewardPhraseLibrary, type RewardPhraseLibrary } from "../../usecase/reward-phrase.usecase";
import { createSettingsStore, type SettingsStore } from "../../usecase/settings.usecase";
import { createShowVoice } from "../../usecase/show.usecase";
import { createShowDirector, type ShowDirector } from "../../usecase/show-director.usecase";
import { createShutdown } from "../../usecase/shutdown.usecase";
import { createSoundLibrary, type SoundLibrary } from "../../usecase/sound.usecase";
import { createSoundQueue, type SoundQueue } from "../../usecase/sound-queue.usecase";
import { createTimetable } from "../../usecase/timetable.usecase";
import { createTwitchConnection, type TwitchConnection } from "../../usecase/twitch-connection.usecase";
import { createViewers, type Viewers, type ViewersPort } from "../../usecase/viewers.usecase";
import { toEndPort } from "./control-end";
import { followObsNames } from "./obs-names";
import { log } from "./server-log";
import { getTwitchApp } from "./twitch-app";

export type Runtime = {
  feed: HeadFeed;
  expressions: ExpressionLibrary;
  settings: SettingsStore;
  obs: ObsClient;
  fox: Fox;
  // D, E, G, H : l'écoute d'Alexis, ses entrées en scène, sa présence, et « Faire parler ».
  mode: FoxModeController;
  chat: Chat;
  // Les remerciements : le tchat leur donne les subs, les cheers et les raids, EventSub les follows et les récompenses.
  thanks: FoxThanks;
  // La connexion d'Alexis à Twitch : son jeton, et l'écoute des follows et des récompenses (EventSub).
  twitch: TwitchConnection;
  // Le bilan du live : « Faire le bilan », et la fin prévue.
  review: FoxReview;
  // Le nombre de viewers du live, relu toutes les 60 s.
  viewers: Viewers;
  // La soundboard : les sounds enregistrés (data/sounds/), et leur queue vers la page /sounds d'OBS.
  sounds: SoundLibrary;
  soundQueue: SoundQueue;
  // Les rewards de la chaîne et le sound de chacun (data/rewards.json) ; seuls ceux que l'app a créés se modifient, se suppriment, se
  // mettent en pause et se remboursent.
  rewards: RewardLibrary;
  // Les phrases de Jean-Renard de chaque récompense de la chaîne (data/reward-phrases.json), et ce qu'il fait d'un rachat.
  rewardPhrases: RewardPhraseLibrary;
  foxReward: FoxReward;
  // L'émission de clips : les clips bruts du dossier d'OBS (ffprobe pour leur durée), servis en flux à l'onglet Émission.
  clips: ClipLibrary;
  // L'émission : elle commence quand la page /show passe à l'antenne d'OBS et s'arrête dès qu'elle n'y est plus ; Jean-Renard n'est
  // alors que dans /show.
  director: ShowDirector;
  // Les téléphones ouverts sur /mobile et les pages OBS de leurs caméras : le serveur ne fait que les mettre en relation (WebRTC).
  phones: Phones;
  // La régie du téléphone : l'état d'OBS, des viewers et du live qu'elle montre, et ses gestes (scène, mic, fin du live, message).
  control: Control;
  // Le retour antenne de la régie : l'image de la scène du programme, une capture d'OBS partagée entre les téléphones.
  monitor: Monitor;
};

// Le plugin Nitro et les routes serveur partagent ce module : c'est le seul état du serveur.
let current: Runtime | undefined;

// Le port du serveur du stream, celui de la source OBS et de l'adresse de retour de Twitch. Un serveur d'essai tourne sur un
// autre `PORT` : il ne lit pas les rachats et ne touche pas aux rewards, sinon il rendrait des points que le vrai serveur joue.
const STREAM_PORT = "4747";

// Le temps qui passe pour le renard et pour la lecture du tchat : un minuteur annulable.
const schedule = (callback: () => void, ms: number): (() => void) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

const isSame = (a: ExpressionRef, b: ExpressionRef): boolean => a.id === b.id && a.version === b.version;

// Câblage : la photo et les réglages sont lus ici, une seule fois ; le mic d'OBS alimente la boucle de la tête, et
// chaque réglage changé depuis l'interface (curseurs, expression active, allure du tchat) s'applique à la boucle, au
// client OBS et au tchat sans relancer le serveur. Les expressions enregistrées vivent dans data/heads/ ; une expression
// retouchée s'applique aussitôt. Le tchat se lit sans OBS : il démarre même quand OBS est fermé.
export function startRuntime(): Runtime {
  const root = process.cwd();
  const port = process.env.PORT ?? STREAM_PORT;
  const isStreamServer = port === STREAM_PORT;
  // L'arrêt (OBS se ferme, OBS ne revient pas, signal) met d'abord les rewards en pause : hors stream, personne ne les dépense.
  const shutdown = createShutdown({
    pauseRewards: async () => {
      if (isStreamServer) await rewards.pauseRewards();
    },
    exit: () => process.exit(0),
    schedule,
    log,
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(`Signal ${signal} reçu : arrêt du serveur.`));
  }
  const localPath = join(root, "settings.local.json");
  // Une fin prévue encore écrite « HH:MM » (foxEndTime) devient un instant dans le fichier, avant sa lecture.
  upgradeLocalSettings(localPath, Date.now(), log);
  // La version de la photo change à chaque démarrage : OBS ne garde pas l'ancienne image de la photo en cache.
  const { head, geometry, images } = getHeadFiles(join(root, "tete-south-park"), String(Date.now()));
  const store = createExpressionStore(join(root, "data", "heads"), log);
  const expressions: ExpressionLibrary = createExpressionLibrary({
    builtIn: { head, geometry, images },
    store,
    createId: () => {
      let id = randomBytes(4).toString("hex");
      while (store.get(id)) id = randomBytes(4).toString("hex");
      return id;
    },
    onChange: () => applyExpression(settings.getState().effective),
  });
  let shown: ExpressionRef = head.expression;
  // L'expression choisie dans les réglages devient celle de la boucle ; si elle a disparu (supprimée), la photo reprend
  // et le choix est effacé de settings.local.json.
  const applyExpression = (effective: Settings): void => {
    const active = expressions.getActive(effective.expression);
    if (!active.found) {
      log(`Expression « ${effective.expression} » introuvable : la photo reprend.`);
      settings.update({ expression: null });
      return;
    }
    if (isSame(active.head.expression, shown)) return;
    shown = active.head.expression;
    loop.updateHead(active.head);
    log(`Expression active : ${shown.id}.`);
  };
  const settings = createSettingsStore({
    defaults: getSettings(join(root, "settings.json")),
    local: getLocalSettings(localPath, log),
    port: {
      updateLocal: (local) => updateLocalSettings(localPath, local),
      deleteLocal: () => deleteLocalSettings(localPath),
    },
    onChange: (effective: Settings) => {
      loop.update(effective);
      applyExpression(effective);
      // Les noms des sources et scènes que les réglages désignent vont d'abord au suivi des identifiants (un nom changé à la main l'emporte) ;
      // ceux qui les lisent reçoivent les noms qu'OBS leur donne. Le nom du mic du PC et la fin prévue vont à la régie : elle garde l'entrée
      // écoutée sur le mic ouvert, caméra comprise.
      ids.update(effective);
      const current = named(effective);
      control.update(current);
      cameraBoost.update(current);
      fox.update(effective);
      mode.update(effective);
      queue.update(effective);
      jab.update(effective);
      shout.update(effective);
      tunnel.update(effective);
      comeback.update(effective);
      balance.update(effective);
      startle.update(effective);
      hours.update(effective);
      thanks.update(effective);
      review.update(effective);
      attitude.update(effective);
      regulars.update(effective);
      chat.update(effective);
      foxChat.update(effective);
      clips.update(effective);
      clipChat.update(effective);
      director.update(current);
      showVoice.update(effective);
    },
    log,
  });
  const initial = settings.getState().effective;
  // Au démarrage : l'expression choisie la dernière fois, ou la photo si elle n'existe plus (l'ancien choix est effacé).
  const start = expressions.getActive(initial.expression);
  if (!start.found) log(`Expression « ${initial.expression} » introuvable au démarrage : la photo reprend.`);
  // Les fichiers de travail d'une synthèse (data/fox-speech/, ignoré) : ceux d'une coupure en pleine synthèse partent ici.
  const speechFolder = join(root, "data", "fox-speech");
  const swept = sweepVoiceFiles(speechFolder);
  if (swept > 0) log(`Renard : ${swept} fichier(s) de synthèse laissé(s) par une coupure supprimé(s).`);
  const fox = createFox({
    voices: createVoiceClient({
      directory: speechFolder,
      run: createPowerShellRunner(),
      createId: () => randomBytes(4).toString("hex"),
    }),
    settings: initial,
    clock: Date.now,
    createId: () => randomBytes(8).toString("hex"),
    toSpeechUrl: (id) => `/api/fox/speech/${id}`,
    log,
  });
  // La liste des voix se lit au démarrage : l'onglet Renard l'affiche sans attendre PowerShell.
  void fox.listVoices();
  // Le mot de passe vient de .env (OBS_PASSWORD) ; absent ou vide = connexion sans mot de passe.
  const obsSocket = createObsSocket({
    address: initial.obsAddress,
    password: process.env.OBS_PASSWORD || undefined,
    log,
  });
  // Les entrées et scènes que les réglages nomment (micName, desktopName, cameraSlotScene, showEndScene) sont suivies par leur identifiant
  // d'OBS, retenu dans data/obs-ids.json (hors de git) : renommées dans OBS, elles restent trouvées.
  const ids = createObsIds({
    source: obsSocket,
    store: createObsIdsStore(join(root, "data", "obs-ids.json"), log),
    settings: initial,
    log,
  });
  const named = (effective: Settings): Settings => toNamedSettings(effective, ids.getNames());
  const obs = createObsClient(
    {
      address: initial.obsAddress,
      ids,
      // Seules les sources qui pointent vers CE port sont rafraîchies : un serveur d'essai sur un autre port ne touche pas à celle du stream.
      pageHosts: [`localhost:${port}`, `127.0.0.1:${port}`],
      log,
      onExit: (reason) => void shutdown(reason),
    },
    obsSocket,
  );
  const loop = createHeadLoop({
    mic: obs.mic,
    head: start.head,
    settings: initial,
    clock: Date.now,
    random: Math.random,
  });
  const chat = createChat({
    source: createChatClient({ channel: toChatChannel(initial), log }),
    settings: initial,
    clock: Date.now,
  });
  // Le renard lit le tchat : la liste d'insultes est un fichier du dépôt, le serveur ne démarre pas sans elle.
  const insults = getInsults(join(root, "moderation", "insults.fr.txt"));
  const mode = createFoxMode({ mic: obs.mic, fox, settings: initial, clock: Date.now, schedule, log });
  // Les emotes de 7TV, BTTV et FFZ (globales et de la chaîne) : synchronisées au démarrage puis toutes les heures, gardées
  // dans data/emotes.txt pour les pannes de réseau.
  const emotes = createEmoteSync({
    port: createEmoteClient({ channelId: initial.chatChannelId, login: toChatChannel(initial) }),
    store: createEmoteStore(join(root, "data", "emotes.txt"), log),
    clock: Date.now,
    schedule,
    log,
  });
  // La file de parole : les messages du tchat (et plus tard les remerciements et les piques) y attendent leur tour.
  const queue = createFoxQueue({ fox, mode, settings: initial, clock: Date.now, schedule, log });
  // Les habitués : data/viewers.json (hors de git) garde la venue de chaque viewer, de quoi l'accueillir d'une phrase.
  const regulars = createFoxRegulars({
    port: createRegularsStore(join(root, "data", "viewers.json"), log),
    settings: initial,
    insults,
    clock: Date.now,
    schedule,
    random: Math.random,
    log,
  });
  process.once("exit", regulars.stop);
  // Le compte des messages acceptés de chaque viewer depuis le démarrage du serveur.
  const tally = createFoxTally();
  const review = createFoxReview({ tally, queue, settings: initial, insults, log });
  // L'humeur du renard suit le tchat : joyeux quand il s'anime, boudeur quand il se tait, et la phrase de la reprise.
  const attitude = createFoxAttitude({
    mode,
    fox,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  const foxChat = createFoxChat({
    chat,
    queue,
    mode,
    emotes,
    regulars,
    tally,
    attitude,
    settings: initial,
    insults,
    clock: Date.now,
    log,
  });
  // L'application Twitch (LivePlace) : ses identifiants viennent de .env. Sans eux, le nombre de viewers et le planning restent
  // inconnus, la connexion d'Alexis est indisponible et les follows attendent ; le journal le dit une fois.
  const twitchApp = getTwitchApp(process.env);
  if (!twitchApp) {
    log(
      "Twitch : TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET absents de .env : pas de nombre de viewers, pas de planning, pas de connexion, les follows attendent.",
    );
  }
  // Le planning d'Alexis (son prochain live entre dans les rappels de la relance) : l'API Twitch avec le jeton de l'application,
  // relue toutes les 30 min. Sans application, aucun live à venir.
  const timetable = createTimetable({
    port: twitchApp
      ? createTimetableClient({ ...twitchApp, channelId: initial.chatChannelId })
      : { get: async () => [] },
    schedule,
    clock: Date.now,
    log,
  });
  // La relance : caché, après un long silence de Fenysk et du tchat, il revient dire une pique à Fenysk, puis un rappel au tchat.
  const jab = createFoxJab({
    chat,
    queue,
    mode,
    fox,
    timetable,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  // Le cri : visible, il sursaute quand Fenysk crie, et proteste si c'est pénible.
  const shout = createFoxShout({
    mic: obs.mic,
    queue,
    mode,
    fox,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  // Le tunnel : Fenysk parle des minutes sans pause, le renard bâille puis le fait remarquer.
  const tunnel = createFoxTunnel({
    queue,
    mode,
    settings: initial,
    clock: Date.now,
    schedule,
    random: Math.random,
    log,
  });
  // Le retour : Fenysk reparle après des minutes de silence (mic coupé compris), le renard le salue d'une phrase.
  const comeback = createFoxComeback({
    queue,
    mode,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  // La balance du son : pendant que Fenysk parle, le son du PC ne doit pas couvrir sa voix.
  const balance = createFoxBalance({
    mic: obs.mic,
    desktop: obs.desktop,
    queue,
    mode,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  // Le sursaut du jeu : un pic soudain du son du PC fait sursauter le renard, sans un mot.
  const startle = createFoxStartle({
    desktop: obs.desktop,
    queue,
    mode,
    fox,
    settings: initial,
    clock: Date.now,
    log,
  });
  // La fin prévue s'efface quand le live est fini, par un changement de réglage ; elle voit la diffusion avant l'heure du live.
  const endReset = createFoxEndReset({
    broadcast: obs.broadcast,
    end: {
      get: () => toInstant(settings.getState().effective.foxEndAt ?? ""),
      reset: () => {
        const update = settings.update({ foxEndAt: "" });
        if (!update.ok) log(`Renard : ${update.issues.map(({ message }) => message).join(" ; ")}`);
        return update.ok;
      },
    },
    clock: Date.now,
    schedule,
    log,
  });
  // L'heure du live : pendant la diffusion d'OBS, il annonce les heures pleines, la fin prévue et ses rappels.
  const hours = createFoxHours({
    broadcast: obs.broadcast,
    queue,
    mode,
    review,
    settings: initial,
    clock: Date.now,
    random: Math.random,
    log,
  });
  // Le nombre de viewers (variable {viewers} des remerciements) : l'API Twitch avec le jeton de l'application, sans la
  // connexion d'Alexis.
  const viewersPort: ViewersPort = twitchApp
    ? createViewersClient({ ...twitchApp, channelId: initial.chatChannelId })
    : {
        get: async () => {
          throw new Error("identifiants Twitch absents");
        },
      };
  const viewers = createViewers({ port: viewersPort, schedule, log });
  // Les remerciements : un follow, un sub, un resub, un sub offert, des bits ou un raid donnent une phrase, devant les messages ;
  // une récompense de points de chaîne fait piquer Fenysk (par la relance) ou réveille le renard.
  const thanks = createFoxThanks({
    chat,
    queue,
    foxChat,
    viewers,
    tally,
    fox,
    jab,
    settings: initial,
    insults,
    clock: Date.now,
    schedule,
    random: Math.random,
    log,
  });
  // La connexion d'Alexis : le jeton vit dans data/twitch-token.json (hors de git), les follows et les récompenses arrivent par
  // EventSub et vont aux remerciements comme les évènements du tchat. Une récompense va aussi à la queue des sons et aux
  // phrases du renard, sur le serveur du stream seulement ; dès que le jeton peut gérer les récompenses, celles que l'app a créées
  // sortent de pause et leurs rachats restés UNFULFILLED sont remboursés.
  const twitch = createTwitchConnection({
    app: twitchApp && {
      clientId: twitchApp.clientId,
      auth: createTwitchAuthClient(twitchApp),
      feed: createEventFeed({ clientId: twitchApp.clientId, schedule, log }),
    },
    store: createTwitchTokenStore(join(root, "data", "twitch-token.json"), log),
    broadcasterId: initial.chatChannelId,
    onEvent: (event) => {
      thanks.receive(event);
      if (event.kind === "reward" && isStreamServer) foxReward.redeem(event);
    },
    ...(isStreamServer ? { onReady: () => void rewards.openRewards() } : {}),
    clock: Date.now,
    schedule,
    createState: () => randomBytes(16).toString("hex"),
    log,
  });
  // La soundboard : les sounds vivent dans data/sounds/ (hors de git), un seul joue à la fois, dans la page /sounds d'OBS. Les
  // rewards de points de chaîne vivent sur Twitch ; data/rewards.json garde le sound de chacun et ceux que l'app a créés. Un
  // sound.json d'avant (reward, coût, pace) y est converti avant la lecture des sounds. Sans les identifiants de l'application,
  // le client des rewards répond que Twitch n'est pas prêt.
  const soundsFolder = join(root, "data", "sounds");
  const rewardStore = createRewardStore(join(root, "data", "rewards.json"), log);
  upgradeSounds(soundsFolder, rewardStore, log);
  const soundStore = createSoundStore(soundsFolder, log);
  // Sans l'application Twitch, les clients Helix (rewards, chat) répondent que Twitch n'est pas prêt.
  const twitchClientId = twitchApp?.clientId ?? "";
  const twitchRewards = createRewardsClient({
    clientId: twitchClientId,
    broadcasterId: initial.chatChannelId,
    getAccessToken: (isForced) => twitch.getRewardsToken(isForced),
  });
  // Les phrases de Jean-Renard pour une récompense : data/reward-phrases.json (hors de git). Les récompenses du renard (clash,
  // wake) gardent leurs phrases de l'onglet Renard.
  const isReserved = (title: string): boolean => isFoxReward(title, settings.getState().effective);
  const rewardPhrases = createRewardPhraseLibrary({
    store: createRewardPhraseStore(join(root, "data", "reward-phrases.json"), log),
    rewards: twitchRewards,
    isReserved,
    log,
  });
  const sounds = createSoundLibrary({
    store: soundStore,
    createId: () => {
      let id = randomBytes(4).toString("hex");
      while (soundStore.get(id)) id = randomBytes(4).toString("hex");
      return id;
    },
    usage: {
      listRewardTitles: (soundId) => rewards.listTitlesOf(soundId),
      // Le dossier des clips illisible : le nombre de clips est inconnu, il n'est pas inventé.
      listClipCounts: () => {
        const confirmed = clips.listConfirmed();
        return confirmed.ok ? toClipCounts(confirmed.value) : undefined;
      },
    },
    // La queue rend les points des rachats en attente du sound, puis les rewards qui le désignent le lâchent.
    onDelete: async (id) => {
      await soundQueue.forget(id);
      rewards.detachSound(id);
    },
    log,
  });
  const rewards = createRewardLibrary({
    store: rewardStore,
    twitch: twitchRewards,
    sounds,
    onDelete: (rewardId) => soundQueue.forgetReward(rewardId),
    clearPhrases: async (rewardId) => {
      await rewardPhrases.update(rewardId, []);
    },
    log,
  });
  const soundQueue = createSoundQueue({
    library: sounds,
    records: rewards,
    rewards: twitchRewards,
    createId: () => randomBytes(8).toString("hex"),
    schedule,
    log,
  });
  const foxReward = createFoxReward({
    queue,
    mode,
    sounds: soundQueue,
    phrases: rewardPhrases,
    jab,
    insults,
    isReserved,
    isFlinch: (title) => isFlinchReward(title, settings.getState().effective),
    getFlinchDelay: () => settings.getState().effective.foxFlinchDelay ?? 0,
    schedule,
    random: Math.random,
    log,
  });
  // L'émission de clips : ffprobe et ffmpeg viennent du PATH ; un encodage en cours est tué avec le serveur.
  const processes = createProcessRunner();
  process.once("exit", processes.stop);
  const ffmpeg = createFfmpegClient(processes.run, log);
  const clipStore = createClipStore(log);
  const clips = createClipLibrary({
    store: clipStore,
    probe: ffmpeg,
    encoder: ffmpeg,
    // Le son d'un clip se mesure avec ffmpeg (spikes) et son tchat se place sur le clip, à la demande de la page /show.
    analysis: createClipAnalysis({ store: clipStore, probe: ffmpeg, levels: ffmpeg, log }),
    clock: Date.now,
    log,
  });
  clips.update(initial);
  // Le tchat de chaque clip : OBS sauvegarde le tampon de relecture, le serveur écrit à côté du clip les messages de ses dernières minutes.
  const clipChat = createClipChat({
    chat,
    replay: obs.replay,
    probe: ffmpeg,
    store: createClipChatStore(),
    clock: Date.now,
    schedule,
    log,
  });
  clipChat.update(initial);
  // Ce que Jean-Renard dit dans l'émission (ouverture, clôture, phrase de chaque clip) : sa voix sort de la page /show.
  const showVoice = createShowVoice({
    say: (text) => fox.speakInShow(text),
    settings: initial,
    random: Math.random,
    log,
  });
  // L'émission : OBS dit quand la page /show passe à l'antenne ; Jean-Renard glisse alors hors de /fox, la file de parole se tient.
  const director = createShowDirector({
    scene: obs.show,
    clips,
    fox,
    queue,
    presence: mode,
    mic: mode,
    clock: Date.now,
    voice: showVoice,
    sounds,
    settings: named(initial),
    random: Math.random,
    createId: () => randomBytes(8).toString("hex"),
    schedule,
    log,
  });
  // Les téléphones : l'image et le son vont du téléphone à la page OBS sans passer par le serveur, qui ne fait passer que les signaux.
  const phones = createPhones({ log });
  // Le boost des téléphones : la voix d'Alexis arrive plus faible d'un téléphone que du micro du PC ; quand le micro du live est une caméra,
  // la source de cette caméra monte vers `cameraBoostTarget`, jamais celle du PC.
  const cameraBoost = createCameraBoost({
    levels: obs.levels,
    port: obs.boost,
    settings: named(initial),
    schedule,
    log,
  });
  // La régie du téléphone : elle lit OBS (scène, micros), la diffusion, les viewers et les téléphones, écrit dans le chat au nom
  // d'Alexis (droit `user:write:chat` du jeton), décale la fin du live (`foxEndAt`), et garde l'entrée que la tête et Jean-Renard
  // écoutent sur le mic ouvert.
  const control = createControl({
    obs: obs.control,
    broadcast: obs.broadcast,
    viewers,
    phones,
    chat: createChatWriterClient({
      clientId: twitchClientId,
      broadcasterId: initial.chatChannelId,
      getSender: (isForced) => twitch.getChatSender(isForced),
    }),
    chatViewers: createChatViewersClient({
      clientId: twitchClientId,
      broadcasterId: initial.chatChannelId,
      getReader: (isForced) => twitch.getChatViewersReader(isForced),
    }),
    end: toEndPort(settings),
    settings: named(initial),
    // L'entrée écoutée est celle du micro du live : la tête et Jean-Renard la suivent, et le boost aussi quand c'est une caméra.
    listen: (input) => {
      obs.updateMicName(input);
      cameraBoost.updateLiveInput(input);
    },
    clock: Date.now,
    schedule,
    log,
  });
  // Le retour antenne capture la scène que la régie dit à l'antenne.
  const monitor = createMonitor({
    port: obs.monitor,
    getScene: () => control.getState().scene,
    clock: Date.now,
    schedule,
  });
  followObsNames({ ids, settings, boost: cameraBoost, control, director, log });
  log(`Renard : liste d'insultes chargée (${insults.parts.length + insults.words.size} entrées).`);
  shown = start.head.expression;
  loop.start();
  if (!start.found) settings.update({ expression: null });
  director.start();
  obs.start();
  control.start();
  cameraBoost.start();
  clipChat.start();
  mode.start();
  queue.start();
  void emotes.start();
  foxChat.start();
  regulars.start();
  attitude.start();
  jab.start();
  shout.start();
  tunnel.start();
  comeback.start();
  balance.start();
  startle.start();
  endReset.start();
  hours.start();
  thanks.start();
  void viewers.start();
  void timetable.start();
  void twitch.start();
  chat.start();
  log(
    `Serveur démarré : http://localhost:${port}/head, /chat, /fox, /sounds et /show (réglages : http://localhost:${port}/)`,
  );
  log(`Sons : ${sounds.list().length} dans data/sounds/.`);
  log(
    `Réglages : micro « ${named(initial).micName} », seuil ${initial.threshold} dB, délai ${initial.delay} ms.`,
  );
  current = {
    feed: loop.feed,
    expressions,
    settings,
    obs,
    chat,
    fox,
    mode,
    thanks,
    twitch,
    review,
    viewers,
    sounds,
    soundQueue,
    rewards,
    rewardPhrases,
    foxReward,
    clips,
    director,
    phones,
    control,
    monitor,
  };
  return current;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error("Le serveur n'a pas fini de démarrer.");
  return current;
}
