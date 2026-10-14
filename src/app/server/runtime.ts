import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { toChatChannel } from "../../domain/chat-settings.rules";
import type { ExpressionRef } from "../../domain/head.types";
import type { Settings } from "../../domain/settings.schema";
import { createChatClient } from "../../infra/chat.client";
import { createEmoteClient } from "../../infra/emotes.client";
import { createEmoteStore } from "../../infra/emotes.repository";
import { createExpressionStore } from "../../infra/expression.repository";
import { getHeadFiles } from "../../infra/head-files.repository";
import { getInsults } from "../../infra/insults.repository";
import {
  deleteLocalSettings,
  getLocalSettings,
  updateLocalSettings,
} from "../../infra/local-settings.repository";
import { createObsClient, createObsSocket, type ObsClient } from "../../infra/obs.client";
import { createRegularsStore } from "../../infra/regulars.repository";
import { getSettings } from "../../infra/settings.repository";
import { createTwitchAuthClient } from "../../infra/twitch-auth.client";
import { createFollowFeed } from "../../infra/twitch-follows.client";
import { createTimetableClient } from "../../infra/twitch-timetable.client";
import { createTwitchTokenStore } from "../../infra/twitch-token.repository";
import { createViewersClient } from "../../infra/twitch-viewers.client";
import { createPowerShellRunner, createVoiceClient, sweepVoiceFiles } from "../../infra/voice.client";
import { type Chat, createChat } from "../../usecase/chat.usecase";
import { createEmoteSync } from "../../usecase/emote-sync.usecase";
import { createExpressionLibrary, type ExpressionLibrary } from "../../usecase/expression.usecase";
import { createFox, type Fox } from "../../usecase/fox.usecase";
import { createFoxAttitude } from "../../usecase/fox-attitude.usecase";
import { createFoxBalance } from "../../usecase/fox-balance.usecase";
import { createFoxChat } from "../../usecase/fox-chat.usecase";
import { createFoxHours } from "../../usecase/fox-hours.usecase";
import { createFoxJab } from "../../usecase/fox-jab.usecase";
import { createFoxMode, type FoxModeController } from "../../usecase/fox-mode.usecase";
import { createFoxQueue } from "../../usecase/fox-queue.usecase";
import { createFoxRegulars } from "../../usecase/fox-regulars.usecase";
import { createFoxReview, type FoxReview } from "../../usecase/fox-review.usecase";
import { createFoxShout } from "../../usecase/fox-shout.usecase";
import { createFoxStartle } from "../../usecase/fox-startle.usecase";
import { createFoxTally } from "../../usecase/fox-tally.usecase";
import { createFoxThanks, type FoxThanks } from "../../usecase/fox-thanks.usecase";
import { createFoxTunnel } from "../../usecase/fox-tunnel.usecase";
import { createHeadLoop, type HeadFeed } from "../../usecase/head.usecase";
import { createSettingsStore, type SettingsStore } from "../../usecase/settings.usecase";
import { createTimetable } from "../../usecase/timetable.usecase";
import { createTwitchConnection, type TwitchConnection } from "../../usecase/twitch-connection.usecase";
import { createViewers, type ViewersPort } from "../../usecase/viewers.usecase";
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
  // Les remerciements : le tchat leur donne les subs et les cheers, EventSub les follows.
  thanks: FoxThanks;
  // La connexion d'Alexis à Twitch : son jeton, et l'écoute des follows (EventSub).
  twitch: TwitchConnection;
  // Le bilan du live : « Faire le bilan », et la fin prévue.
  review: FoxReview;
};

// Le plugin Nitro et les routes serveur partagent ce module : c'est le seul état du serveur.
let current: Runtime | undefined;

const exitServer = (reason: string): void => {
  log(reason);
  process.exit(0);
};

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
  const port = process.env.PORT ?? "4747";
  const localPath = join(root, "settings.local.json");
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
      obs.updateMicName(effective.micName);
      obs.updateDesktopName(effective.desktopName);
      fox.update(effective);
      mode.update(effective);
      queue.update(effective);
      jab.update(effective);
      shout.update(effective);
      tunnel.update(effective);
      balance.update(effective);
      startle.update(effective);
      hours.update(effective);
      thanks.update(effective);
      review.update(effective);
      attitude.update(effective);
      regulars.update(effective);
      chat.update(effective);
      foxChat.update(effective);
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
  const obs = createObsClient(
    {
      address: initial.obsAddress,
      micName: initial.micName,
      desktopName: initial.desktopName,
      // Seules les sources qui pointent vers CE port sont rafraîchies : un serveur d'essai sur un autre port ne touche pas à celle du stream.
      pageHosts: [`localhost:${port}`, `127.0.0.1:${port}`],
      log,
      onExit: exitServer,
    },
    // Le mot de passe vient de .env (OBS_PASSWORD) ; absent ou vide = connexion sans mot de passe.
    createObsSocket({ address: initial.obsAddress, password: process.env.OBS_PASSWORD || undefined, log }),
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
    : { get: async () => null };
  const viewers = createViewers({ port: viewersPort, schedule, log });
  // Les remerciements : un follow, un sub, un resub, un sub offert ou des bits donnent une phrase, devant les messages.
  const thanks = createFoxThanks({
    chat,
    queue,
    foxChat,
    viewers,
    tally,
    jab,
    settings: initial,
    insults,
    clock: Date.now,
    schedule,
    random: Math.random,
    log,
  });
  // La connexion d'Alexis : le jeton vit dans data/twitch-token.json (hors de git), les follows arrivent par EventSub et
  // vont aux remerciements comme ceux du tchat.
  const twitch = createTwitchConnection({
    app: twitchApp && {
      clientId: twitchApp.clientId,
      auth: createTwitchAuthClient(twitchApp),
      feed: createFollowFeed({ clientId: twitchApp.clientId, schedule, log }),
    },
    store: createTwitchTokenStore(join(root, "data", "twitch-token.json"), log),
    broadcasterId: initial.chatChannelId,
    onFollow: (nickname) => thanks.receive({ kind: "follow", user: nickname }),
    clock: Date.now,
    schedule,
    createState: () => randomBytes(16).toString("hex"),
    log,
  });
  log(`Renard : liste d'insultes chargée (${insults.parts.length + insults.words.size} entrées).`);
  shown = start.head.expression;
  loop.start();
  if (!start.found) settings.update({ expression: null });
  obs.start();
  mode.start();
  queue.start();
  void emotes.start();
  foxChat.start();
  regulars.start();
  attitude.start();
  jab.start();
  shout.start();
  tunnel.start();
  balance.start();
  startle.start();
  hours.start();
  thanks.start();
  void viewers.start();
  void timetable.start();
  void twitch.start();
  chat.start();
  log(
    `Serveur démarré : http://localhost:${port}/head, /chat et /fox (réglages : http://localhost:${port}/)`,
  );
  log(`Réglages : micro « ${initial.micName} », seuil ${initial.threshold} dB, délai ${initial.delay} ms.`);
  current = { feed: loop.feed, expressions, settings, obs, chat, fox, mode, thanks, twitch, review };
  return current;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error("Le serveur n'a pas fini de démarrer.");
  return current;
}
