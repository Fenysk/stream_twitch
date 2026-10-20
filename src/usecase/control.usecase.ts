import { toSortedChatViewers } from "../domain/chat-viewers.rules";
import type { ChatViewer } from "../domain/chat-viewers.schema";
import {
  isMicSilent,
  type ObsMics,
  PC_MIC_ID,
  toControlMics,
  toListenedInput,
  toLiveMic,
  toMicPlan,
  toMicSources,
} from "../domain/control.rules";
import type { ControlState } from "../domain/control.schema";
import { isMicCoveredByPicture, toDirectMicId } from "../domain/fallback.rules";
import { type EndDirection, toEndClock, toSteppedEndAt } from "../domain/hours.rules";
import { toInstant } from "../domain/instant.rules";
import type { PhoneSummary } from "../domain/phone.schema";
import {
  type ObsPictureMember,
  PICTURE_FALLBACK_MS,
  toFallbackPictureId,
  toLiveCameraMicId,
  toLostMicId,
  toLostPictureId,
  toNextPictureId,
  toPictureLabel,
  toPictureMicId,
  toPictureState,
} from "../domain/picture.rules";
import type { PictureState } from "../domain/picture.schema";
import type { Settings } from "../domain/settings.schema";
import type { Broadcast, BroadcastPort } from "./fox-hours.usecase";
import type { Phones } from "./phone.usecase";
import type { ShowSceneResult } from "./show-director.usecase";
import type { Viewers } from "./viewers.usecase";

// Ce qu'OBS dit à la régie : est-il joint, la scène du programme et les scènes, la coupure des micros (voir ObsMics), et les numéros des
// caméras à l'antenne (une de leurs sources est visible dans la scène du programme), et les membres de la place caméra avec celui qui est
// visible (vide : pas de place, ou OBS ne la donne pas).
export type ObsControlState = ObsMics & {
  isLinked: boolean;
  scene: string | null;
  scenes: string[];
  onAir: number[];
  picture: ObsPictureMember[];
};

// OBS non joint : rien à montrer, aucun micro connu, aucune caméra à l'antenne, aucune image.
export const OBS_OFFLINE: ObsControlState = {
  isLinked: false,
  scene: null,
  scenes: [],
  isPcMuted: null,
  cameras: [],
  onAir: [],
  picture: [],
};

// OBS vu de la régie ; infra l'implémente avec obs-websocket. Un refus (OBS non joint, scène ou entrée inconnue) est un résultat,
// jamais une exception.
export type ObsControlPort = {
  // Quelque chose a changé qui peut changer l'état : OBS joint ou perdu, la scène, les scènes, les sources, une coupure.
  subscribe(listener: () => void): () => void;
  // L'état d'OBS à l'instant, avec la coupure de l'entrée du mic du PC.
  getState(pcMic: string): Promise<ObsControlState>;
  updateProgramScene(name: string): Promise<ShowSceneResult>;
  // Une entrée est coupée (`true`) ou rouverte (`false`).
  updateInputMute(input: string, isMuted: boolean): Promise<ShowSceneResult>;
  // La diffusion s'arrête (StopStream).
  stopStream(): Promise<ShowSceneResult>;
  // Ce membre de la place caméra est seul à l'image : OBS relit la place, montre ses éléments et cache ceux des autres membres.
  updatePicture(id: string): Promise<ShowSceneResult>;
};

// Le résultat d'un geste de la régie : fait, ou refusé avec son code HTTP et la phrase à montrer sur le téléphone.
export type ControlResult = { ok: true } | { ok: false; status: number; message: string };

// Le chat vu de la régie : écrire un message au nom d'Alexis. Infra l'implémente avec l'API Helix de Twitch.
export type ChatWriterPort = { send(text: string): Promise<ControlResult> };

// Qui est connecté au chat de la chaîne : la liste complète (pagination suivie) ou le refus à montrer. Infra l'implémente avec l'API Helix de
// Twitch ; seuls les viewers connectés à Twitch y sont.
export type ChatViewersResult =
  | { ok: true; chatViewers: ChatViewer[] }
  | { ok: false; status: number; message: string };
export type ChatViewersPort = { list(): Promise<ChatViewersResult> };

// Les réglages que la régie lit : le nom du mic du PC, et la fin prévue du live (un instant ISO, vide : aucune).
export type ControlSettings = Pick<Settings, "micName" | "foxEndAt">;

export type ControlDeps = {
  obs: ObsControlPort;
  broadcast: BroadcastPort;
  viewers: Pick<Viewers, "getState" | "subscribe">;
  phones: Pick<Phones, "getState" | "subscribe">;
  chat: ChatWriterPort;
  chatViewers: ChatViewersPort;
  // Remplace la fin prévue du live (`foxEndAt`) ; les réglages peuvent la refuser.
  end: { update(endAt: number | null): { ok: true } | { ok: false; message: string } };
  settings: ControlSettings;
  // L'entrée que la tête et Jean-Renard écoutent devient celle-ci (`updateMicName` du client OBS).
  listen: (input: string) => void;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type Control = {
  start(): void;
  stop(): void;
  getState(): ControlState;
  // Chaque nouvel état, tant qu'on écoute. L'état de départ se lit par `getState`.
  subscribe(listener: (state: ControlState) => void): () => void;
  // Les réglages changent : le nom du mic du PC, la fin prévue.
  update(settings: ControlSettings): void;
  updateScene(name: string): Promise<ControlResult>;
  // Ouvre ce micro et coupe tous les autres : un seul est ouvert à la fois, et la tête et Jean-Renard écoutent celui-là. `mute` (Muet) les
  // coupe tous. Refusé : 404 micro inconnu, 409 source introuvable, OBS non joint, ou OBS refuse.
  updateMic(id: string): Promise<ControlResult>;
  // Un cran sur la fin prévue du live, comme les touches « Fin du live » du Stream Deck.
  updateEnd(direction: EndDirection): ControlResult;
  sendMessage(text: string): Promise<ControlResult>;
  // Les personnes connectées au chat, triées par pseudo ; la liste des viewers de la régie la lit à chaque ouverture.
  listChatViewers(): Promise<ChatViewersResult>;
  // Arrête le live dans OBS : refusé (409) quand il n'est pas en cours, ou qu'OBS refuse.
  stopLive(): Promise<ControlResult>;
  // Ce membre de la place caméra (`pc`, `head`, `camera-3`) passe à l'image, les autres sont cachés, et l'image décide du micro : la caméra
  // à l'image prend le sien, le PC prend celui du PC, la tête n'y touche pas ; avec `isMicKept`, le micro du live reste où il est. En Muet
  // (aucun micro entendu), l'image ne rouvre aucun micro : seul `updateMic` en sort.
  // Refusé : 404 membre inconnu, 409 caméra dont le téléphone ne filme pas vers OBS, ou OBS refuse.
  updatePicture(id: string, keep?: MicKeep): Promise<ControlResult>;
  // Le membre suivant sur la touche du Stream Deck : PC, les caméras disponibles par numéro, la tête, puis PC.
  updatePictureNext(): Promise<ControlResult>;
};

// Ce qui change la façon dont l'image se choisit : le micro du live ne suit pas.
export type MicKeep = { isMicKept?: boolean };

const refuse = (status: number, message: string): ControlResult => ({ ok: false, status, message });

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Ce que la touche d'un micro sans entrée dans OBS dit : celui du PC vient des réglages, celui d'une caméra de sa source navigateur mic
// (la page `/camera/<n>/mic`), qui se pose dans une scène présente partout pour que son son passe quelle que soit la scène.
const toUnavailableText = (id: string, label: string, pcName: string): string =>
  id === PC_MIC_ID
    ? `l'entrée « ${pcName} » est introuvable dans OBS : vérifie micName dans settings.json`
    : `la source mic de ${label} est introuvable : crée-la avec son adresse mic de l'onglet Mobile (celle qui finit par /mic), « Contrôler l'audio via OBS » cochée, dans une scène « Master - Micros » ajoutée à chaque scène`;

const toOpenedLine = (label: string, muted: number): string =>
  `Régie : micro « ${label} » ouvert, ${muted} entrée${muted > 1 ? "s" : ""} coupée${muted > 1 ? "s" : ""}.`;

const toMutedLine = (muted: number): string =>
  `Régie : Muet, ${muted} entrée${muted > 1 ? "s" : ""} coupée${muted > 1 ? "s" : ""}.`;

export function createControl({
  obs,
  broadcast,
  viewers,
  phones,
  chat,
  chatViewers,
  end,
  settings: initial,
  listen,
  clock,
  schedule,
  log,
}: ControlDeps): Control {
  let settings = initial;
  let obsState = OBS_OFFLINE;
  // La dernière diffusion connue et l'instant où le serveur l'a su : la durée avance avec l'horloge.
  let lastBroadcast = { isLive: false, duration: 0, at: clock() };
  // L'entrée écoutée : au départ celle des réglages, que le client OBS suit déjà.
  let listened = initial.micName;
  let turn = 0;
  // La caméra à l'image dont on attend le retour du téléphone, et de quoi annuler le repli que cette attente a programmé.
  let lost: { id: string; cancel: () => void } | null = null;
  // La caméra dont le mic est celui du live (même si son téléphone est parti), et de quoi annuler le retour au PC que l'attente d'un
  // téléphone qui ne filme plus a programmé.
  let liveCameraId: string | null = null;
  let lostMic: { id: string; cancel: () => void } | null = null;
  // L'image vue à la dernière lecture d'OBS (`undefined` : aucune lecture, ou OBS sans place) et celle que l'appli vient de demander : un
  // changement d'image que l'appli n'a pas demandé vient d'OBS, et l'image décide du micro comme pour un choix de l'appli.
  let seenPictureId: string | null | undefined;
  let askedPictureId: string | null = null;
  const listeners = new Set<(state: ControlState) => void>();
  const unsubscribes: (() => void)[] = [];

  const getSources = () =>
    toMicSources(
      settings.micName,
      obsState,
      phones.getState().flatMap(({ number }) => (number === null ? [] : [number])),
    );

  const getBroadcast = (): ControlState["broadcast"] => {
    const isLive = obsState.isLinked && lastBroadcast.isLive;
    return { isLive, durationMs: isLive ? lastBroadcast.duration + (clock() - lastBroadcast.at) : 0 };
  };

  const listNumbers = (isMatching: (phone: PhoneSummary) => boolean): number[] =>
    phones.getState().flatMap((phone) => (phone.number !== null && isMatching(phone) ? [phone.number] : []));

  // Les caméras dont l'image arrive dans OBS : le téléphone est connecté, filme, et sa page image a une liaison vive.
  const getReceiving = (): number[] => listNumbers(({ isReceiving }) => isReceiving);

  // Les caméras dont le mic arrive dans OBS : de même avec la page mic. Le repli du micro suit cette liaison, celui de l'image la précédente.
  const getHeard = (): number[] => listNumbers(({ isHeard }) => isHeard);

  const getPicture = (): PictureState => toPictureState(obsState.picture, getReceiving());

  // Muet : aucun micro ne s'entend. Ni l'image, ni son repli, ni OBS ne rouvrent alors un micro tout seul ; `updateMic` en sort.
  const isSilent = (): boolean =>
    isMicSilent({ isLinked: obsState.isLinked, mics: toControlMics(getSources()) }, obsState.cameras);

  const getState = (): ControlState => ({
    isLinked: obsState.isLinked,
    broadcast: getBroadcast(),
    viewers: viewers.getState(),
    scene: obsState.scene,
    scenes: obsState.scenes,
    mics: toControlMics(getSources()),
    onAir: obsState.onAir,
    endAt: toInstant(settings.foxEndAt ?? ""),
    picture: getPicture(),
  });

  // L'entrée écoutée suit le mic ouvert d'OBS, qu'on l'ait ouvert d'ici ou à la main : la tête et Jean-Renard n'entendent pas
  // Fenysk parler dans le téléphone si elle reste sur le mic du PC, coupé, et croient alors qu'il est parti.
  const follow = () => {
    const next = toListenedInput(getSources(), settings.micName, obsState.cameras);
    if (next === listened) return;
    listened = next;
    listen(next);
    log(`Régie : la tête et Jean-Renard écoutent « ${next} ».`);
  };

  const publish = () => {
    follow();
    const state = getState();
    watchPicture(state.picture);
    watchMic(state);
    followPicture(state);
    for (const listener of listeners) listener(state);
  };

  // OBS est relu en entier ; deux lectures qui se croisent : seule la dernière compte.
  const refresh = async () => {
    turn += 1;
    const mine = turn;
    try {
      const next = await obs.getState(settings.micName);
      if (mine !== turn) return;
      obsState = next;
      publish();
    } catch (error) {
      log(`Régie : l'état d'OBS est illisible, ${toReason(error)}`);
    }
  };

  const onBroadcast = ({ isLive, duration }: Broadcast) => {
    lastBroadcast = { isLive, duration, at: clock() };
    publish();
  };

  // Couper les entrées : le premier refus d'OBS est rendu.
  const mute = async (toMute: readonly string[]): Promise<ControlResult> => {
    const muted = await Promise.all(toMute.map((other) => obs.updateInputMute(other, true)));
    const refused = muted.find((result) => !result.ok);
    return refused && !refused.ok ? refuse(409, refused.reason) : { ok: true };
  };

  // Couper puis ouvrir : le premier refus d'OBS arrête tout, le micro demandé reste coupé plutôt que de passer en double.
  const open = async (input: string, toMute: readonly string[]): Promise<ControlResult> => {
    const muted = await mute(toMute);
    if (!muted.ok) return muted;
    const opened = await obs.updateInputMute(input, false);
    return opened.ok ? { ok: true } : refuse(409, opened.reason);
  };

  // Une caméra dont le téléphone est parti n'est plus dans la liste des micros, mais sa source reste ouverte dans OBS : elle se coupe aussi.
  const toOrphans = (known: readonly string[]): string[] =>
    obsState.cameras
      .filter(({ input, isMuted }) => !isMuted && !known.includes(input))
      .map(({ input }) => input);

  const updateMute = async (toMute: readonly string[]): Promise<ControlResult> => {
    // Rien à couper ne prouve rien sans OBS : le refus dit qu'OBS n'est pas joint.
    if (!obsState.isLinked) return refuse(409, "OBS n'est pas connecté");
    const all = [...toMute, ...toOrphans(toMute)];
    const result = await mute(all);
    log(result.ok ? toMutedLine(all.length) : `Régie : les micros ne sont pas coupés (${result.message}).`);
    return result;
  };

  const updateMic = async (id: string): Promise<ControlResult> => {
    const plan = toMicPlan(getSources(), id);
    if (plan.kind === "unknown") return refuse(404, "micro inconnu");
    if (plan.kind === "unavailable") return refuse(409, toUnavailableText(id, plan.label, settings.micName));
    if (plan.kind === "mute") return updateMute(plan.toMute);
    const toMute = [...plan.toMute, ...toOrphans([plan.input, ...plan.toMute])];
    const result = await open(plan.input, toMute);
    log(
      result.ok
        ? toOpenedLine(plan.label, toMute.length)
        : `Régie : le micro « ${plan.label} » n'est pas ouvert (${result.message}).`,
    );
    return result;
  };

  // Le refus d'un choix d'image sans rien demander à OBS (pas de place, membre inconnu, caméra qui ne filme pas), ou `null` : il peut passer.
  const toPictureRefusal = (id: string): ControlResult | null => {
    const { members } = getPicture();
    const member = members.find((candidate) => candidate.id === id);
    if (members.length === 0)
      return refuse(409, "OBS n'a pas de place caméra : vérifie cameraSlotScene dans settings.json");
    if (!member) return refuse(404, `${toPictureLabel(id)} n'est pas dans la place caméra d'OBS`);
    return member.isAvailable
      ? null
      : refuse(409, `${member.label} n'est pas disponible : son téléphone ne filme pas vers OBS`);
  };

  // Le membre passe seul à l'image dans OBS, puis l'image décide du micro : la caméra prend le sien, le PC celui du PC, la tête n'y touche
  // pas, et rien ne s'ouvre en Muet. Le micro qui refuse (la source mic d'une caméra manque) laisse l'image où elle est : le refus le dit.
  const updatePicture = async (id: string, keep: MicKeep = {}): Promise<ControlResult> => {
    const refusal = toPictureRefusal(id);
    if (refusal) return refusal;
    const label = toPictureLabel(id);
    askedPictureId = id;
    const shown = await obs.updatePicture(id);
    if (!shown.ok) {
      askedPictureId = null;
      log(`Régie : l'image ne passe pas à ${label} (${shown.reason}).`);
      return refuse(409, shown.reason);
    }
    log(`Régie : ${label} est à l'image.`);
    const micId = toPictureMicId(id);
    if (keep.isMicKept || micId === null) return { ok: true };
    if (isSilent()) {
      log("Régie : Muet, le micro ne s'ouvre pas avec l'image.");
      return { ok: true };
    }
    const heard = await updateMic(micId);
    return heard.ok ? heard : refuse(heard.status, `l'image est passée à ${label}, mais ${heard.message}`);
  };

  // Le téléphone de la caméra à l'image ne filme plus depuis assez longtemps : l'image passe à la tête (à défaut, au PC). La tête ne touche
  // pas au micro (son repli est `fallBackMic`), le PC prend celui du PC. Rien ne la ramène ensuite à cette caméra quand son téléphone revient.
  const fallBackPicture = async (id: string): Promise<void> => {
    const picture = getPicture();
    if (toLostPictureId(picture) !== id) return;
    const target = toFallbackPictureId(picture);
    if (target === null) return;
    const label = picture.members.find((member) => member.id === id)?.label ?? id;
    log(`Régie : ${label} ne filme plus vers OBS depuis ${PICTURE_FALLBACK_MS / 1000} s, l'image se replie.`);
    const result = await updatePicture(target);
    if (!result.ok) log(`Régie : le repli de l'image a échoué (${result.message}).`);
  };

  // Une caméra à l'image dont le téléphone ne filme plus programme le repli ; il s'annule si le téléphone revient avant, ou si l'image
  // change. Un repli lancé ne se reprogramme pas pour la même caméra tant qu'elle reste à l'image sans filmer.
  const watchPicture = (picture: PictureState): void => {
    const id = toLostPictureId(picture);
    if (lost?.id === id) return;
    lost?.cancel();
    lost = id === null ? null : { id, cancel: schedule(() => void fallBackPicture(id), PICTURE_FALLBACK_MS) };
  };

  // Le micro du live est celui d'une caméra dont le mic n'arrive plus dans OBS depuis assez longtemps : il passe explicitement au PC (la tête
  // ne le déplace plus). Quand le repli de l'image va vers le PC, c'est lui qui le fait (avec l'image) : une seule demande.
  const fallBackMic = async (id: string): Promise<void> => {
    if (toLostMicId(liveCameraId, getHeard()) !== id) return;
    const label = toPictureLabel(id);
    log(
      `Régie : le micro de ${label} ne filme plus vers OBS depuis ${PICTURE_FALLBACK_MS / 1000} s, il revient au PC.`,
    );
    const result = await updateMic(PC_MIC_ID);
    if (!result.ok) log(`Régie : le retour du micro au PC a échoué (${result.message}).`);
  };

  // Même attente que l'image : programmée quand le micro du live est une caméra qui ne filme plus, annulée si le téléphone revient avant ou
  // que le micro change, et une seule fois par caméra tant qu'elle garde le micro sans filmer.
  const watchMic = (state: ControlState): void => {
    liveCameraId = toLiveCameraMicId(state.mics, obsState.cameras, liveCameraId);
    const id = toLostMicId(liveCameraId, getHeard());
    const next = id !== null && isMicCoveredByPicture(id, state.picture) ? null : id;
    if (lostMic?.id === next) return;
    lostMic?.cancel();
    lostMic =
      next === null
        ? null
        : { id: next, cancel: schedule(() => void fallBackMic(next), PICTURE_FALLBACK_MS) };
  };

  // Le micro du live : celui qu'une caméra encore ouverte dans OBS garde même si son téléphone est parti.
  const getLiveId = (mics: ControlState["mics"]): string | null => toLiveMic(mics)?.id ?? liveCameraId;

  // Le micro que l'image changée dans OBS demande : il s'ouvre, sauf en Muet.
  const followPictureMic = (pictureId: string, micId: string): void => {
    const label = toPictureLabel(pictureId);
    if (isSilent()) {
      log(`Régie : ${label} est passé à l'image dans OBS, Muet : le micro reste coupé.`);
      return;
    }
    log(`Régie : ${label} est passé à l'image dans OBS, son micro suit.`);
    void updateMic(micId).then((result) => {
      if (!result.ok) log(`Régie : le micro de l'image n'est pas ouvert (${result.message}).`);
    });
  };

  // Une image que l'appli n'a pas demandée vient d'OBS (l'œil d'un élément de la place) : elle décide du micro comme un choix de l'appli.
  // Rien à la première lecture d'OBS ni à la première après une coupure (l'image a pu changer entre-temps), ni quand le micro voulu est
  // déjà celui du live, ni en Muet.
  const followPicture = ({ picture, mics }: ControlState): void => {
    if (!obsState.isLinked || picture.members.length === 0) {
      seenPictureId = undefined;
      return;
    }
    const previous = seenPictureId;
    const { currentId } = picture;
    seenPictureId = currentId;
    if (previous === undefined || previous === currentId) return;
    const isAsked = askedPictureId === currentId;
    askedPictureId = null;
    if (isAsked || currentId === null) return;
    const wanted = toDirectMicId(currentId, getLiveId(mics));
    if (wanted !== null) followPictureMic(currentId, wanted);
  };

  return {
    start() {
      if (unsubscribes.length > 0) return;
      unsubscribes.push(
        obs.subscribe(() => void refresh()),
        broadcast.subscribe(onBroadcast),
        viewers.subscribe(publish),
        phones.subscribe(publish),
      );
      void refresh();
    },
    stop() {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
      lost?.cancel();
      lost = null;
      lostMic?.cancel();
      lostMic = null;
    },
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(next) {
      const isMicChanged = next.micName !== settings.micName;
      if (!isMicChanged && next.foxEndAt === settings.foxEndAt) {
        settings = next;
        return;
      }
      settings = next;
      if (isMicChanged) void refresh();
      else publish();
    },
    async updateScene(name) {
      const result = await obs.updateProgramScene(name);
      if (!result.ok) {
        log(`Régie : la scène « ${name} » n'est pas passée à l'antenne (${result.reason}).`);
        return refuse(409, result.reason);
      }
      return { ok: true };
    },
    updateMic,
    updatePicture,
    async updatePictureNext() {
      const id = toNextPictureId(getPicture());
      return id === null ? refuse(409, "aucune image à choisir") : updatePicture(id);
    },
    updateEnd(direction) {
      const current = toInstant(settings.foxEndAt ?? "");
      const next = toSteppedEndAt(current, clock(), direction);
      if (next === current) return { ok: true };
      const result = end.update(next);
      if (!result.ok) return refuse(422, result.message);
      log(`Régie : fin du live ${toEndClock(next) || "retirée"}.`);
      return { ok: true };
    },
    async listChatViewers() {
      const result = await chatViewers.list();
      if (!result.ok) {
        log(`Régie : la liste du chat est illisible (${result.message}).`);
        return result;
      }
      return { ok: true, chatViewers: toSortedChatViewers(result.chatViewers) };
    },
    async stopLive() {
      if (!getBroadcast().isLive) return refuse(409, "le live n'est pas en cours");
      const result = await obs.stopStream();
      if (!result.ok) {
        log(`Régie : le live n'est pas arrêté (${result.reason}).`);
        return refuse(409, result.reason);
      }
      log("Régie : arrêt du live demandé à OBS.");
      return { ok: true };
    },
    async sendMessage(text) {
      const result = await chat.send(text);
      log(
        result.ok
          ? `Régie : message envoyé au chat (${Array.from(text).length} caractères).`
          : `Régie : message refusé par Twitch (${result.message}).`,
      );
      return result;
    },
  };
}
