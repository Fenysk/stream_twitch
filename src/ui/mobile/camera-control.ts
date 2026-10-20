// La caméra et le mic du téléphone, sans le navigateur : démarrés par Filmer (l'objectif et le cadrage pris à l'appui), arrêtés quand le
// téléphone arrête de filmer ou que Safari passe en arrière-plan, relancés d'un toucher. `Media` est le flux de la caméra (un MediaStream dans
// le navigateur). Le flux change à chaque (re)démarrage et à chaque changement d'objectif : c'est ce qui part vers OBS. La piste audio n'est
// jamais coupée sur le téléphone : c'est la coupure de la source dans OBS qui décide si ce mic est celui du live. La rotation du téléphone ne
// relance jamais la caméra : Safari retourne alors parfois l'image de la piste, et `reframe` la remet dans le cadrage de Filmer sur la piste
// en marche (`applyConstraints`), sans la rouvrir ni couper l'antenne.

import type { Facing, FilmStart, Orientation } from "../../domain/phone-layout.rules";
import {
  type TrackSize,
  toCameraConstraints,
  toCameraFailure,
  toOtherFacing,
  toReframeConstraints,
  toTrackFraming,
  toVideoConstraints,
} from "./camera-media";

export type CameraStatus = "starting" | "live" | "interrupted" | "denied" | "unavailable";

export type CameraTrack = {
  stop(): void;
  addEventListener(type: "ended", listener: () => void, options: { once: true }): void;
  getSettings(): TrackSize;
  applyConstraints(constraints: MediaTrackConstraints): Promise<void>;
};

export type CameraMedia = {
  getTracks(): CameraTrack[];
  getVideoTracks(): CameraTrack[];
  getAudioTracks(): CameraTrack[];
};

// Sans Filmer rien ne tourne : `stream` est vide et le statut ne dit rien.
export type CameraState<Media> = { stream: Media | null; status: CameraStatus; facing: Facing };

export type CameraControlDeps<Media extends CameraMedia> = {
  getMedia(constraints: MediaStreamConstraints): Promise<Media>;
  // L'image de `video` avec le son de `audio` : l'autre objectif remplace l'image, le mic continue.
  joinMedia(video: Media, audio: Media): Media;
  onChange(state: CameraState<Media>): void;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule(callback: () => void, ms: number): () => void;
  log(message: string, error?: unknown): void;
};

export type CameraControl = {
  // Filmer : démarre la caméra avec l'objectif et le cadrage pris à l'appui, qui ne changent plus jusqu'à l'arrêt.
  start(film: FilmStart): void;
  // L'autre objectif, avec le même cadrage. Rien sans caméra en marche.
  switchCamera(): void;
  // Relance la caméra d'un toucher (interrompue, refusée, introuvable), même objectif et même cadrage.
  restart(): void;
  // Le téléphone a tourné : remet l'image de la piste en marche dans le cadrage qu'elle avait au départ, sans la rouvrir. Rien sans caméra.
  reframe(): void;
  // Safari part en arrière-plan : arrête la caméra en marche, qui se relance d'un toucher.
  interrupt(): void;
  // Le téléphone arrête de filmer.
  stop(): void;
};

// Safari met la taille de la piste à jour un peu après la rotation : la taille se vérifie à ces instants (ms), et remise au plus 4 fois.
const REFRAME_CHECKS_MS = [0, 300, 1000, 2500];
const REFRAME_BUDGET = 4;

const stopTracks = (media: CameraMedia | null): void => {
  for (const track of media?.getTracks() ?? []) track.stop();
};

const toErrorName = (error: unknown): string => (error instanceof DOMException ? error.name : "");

export function createCameraControl<Media extends CameraMedia>({
  getMedia,
  joinMedia,
  onChange,
  schedule,
  log,
}: CameraControlDeps<Media>): CameraControl {
  let live: Media | null = null;
  let facing: Facing = "environment";
  let framing: Orientation = "landscape";
  let isRunning = false;
  // Chaque démarrage, changement d'objectif et arrêt prend un tour : la réponse d'une demande plus ancienne est jetée.
  let turn = 0;
  // Le cadrage de l'image qui part vers OBS : celui de la première piste de ce Filmer, tel que le navigateur le donne (pas forcément celui
  // demandé). Toute piste qui suit (autre objectif, relance) et toute rotation y sont remises. `null` : pas encore mesuré, ou taille inconnue.
  let kept: Orientation | null = null;
  // Les vérifications en attente après une rotation, la remise en cours (une seule à la fois) et ce qu'il reste de demandes à Safari.
  let checks: (() => void)[] = [];
  let fixing: object | null = null;
  let budget = 0;

  const emit = (stream: Media | null, status: CameraStatus): void => onChange({ stream, status, facing });

  const cancelChecks = (): void => {
    for (const cancel of checks.splice(0)) cancel();
  };

  // La caméra change ou s'arrête : plus de vérification à faire sur la piste d'avant, et une remise en cours est abandonnée.
  const cancelReframing = (): void => {
    cancelChecks();
    fixing = null;
  };

  const interrupt = (): void => {
    if (live === null) return;
    cancelReframing();
    stopTracks(live);
    live = null;
    emit(null, "interrupted");
  };

  // Demande à Safari le cadrage voulu : sa taille d'abord, puis la taille retournée s'il entend largeur et hauteur à l'envers.
  const applyFraming = async (media: Media, track: CameraTrack, wanted: Orientation): Promise<void> => {
    for (const isFlipped of [false, true]) {
      if (budget === 0 || toTrackFraming(track.getSettings()) === wanted) return;
      budget -= 1;
      await track.applyConstraints(toReframeConstraints(wanted, isFlipped));
      if (live !== media) return;
    }
  };

  // Remet l'image de la piste dans le cadrage gardé quand Safari l'a retournée. La piste reste ouverte : ni nouvelle caméra, ni nouvel état,
  // l'antenne ne coupe pas. Une seule remise à la fois.
  const reframeTrack = async (): Promise<void> => {
    const wanted = kept;
    const media = live;
    const track = media?.getVideoTracks()[0];
    if (wanted === null || media === null || !track || fixing !== null || budget === 0) return;
    const mine = {};
    fixing = mine;
    try {
      await applyFraming(media, track, wanted);
    } catch (error) {
      log("Caméra : le cadrage n'a pas pu être remis", error);
    } finally {
      if (fixing === mine) fixing = null;
    }
  };

  // Une piste qui se termine sans qu'on l'ait arrêtée (Safari part en arrière-plan, un appel arrive) interrompt la caméra.
  const adopt = (next: Media, nextFacing: Facing): void => {
    live = next;
    facing = nextFacing;
    for (const track of next.getTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (live === next) interrupt();
        },
        { once: true },
      );
    }
    emit(next, "live");
    const size = toTrackFraming(next.getVideoTracks()[0]?.getSettings() ?? {});
    if (kept === null) kept = size;
    else {
      budget = REFRAME_BUDGET;
      void reframeTrack();
    }
  };

  const open = async (nextFacing: Facing): Promise<void> => {
    turn += 1;
    const mine = turn;
    cancelReframing();
    stopTracks(live);
    live = null;
    emit(null, "starting");
    try {
      const next = await getMedia(toCameraConstraints(nextFacing, framing));
      if (mine === turn) adopt(next, nextFacing);
      else stopTracks(next);
    } catch (error) {
      log("Caméra : le téléphone n'a pas donné la caméra", error);
      if (mine === turn) emit(null, toCameraFailure(toErrorName(error)));
    }
  };

  // L'autre caméra : l'ancienne image s'arrête avant (un iPhone n'ouvre pas deux caméras), le mic continue. Si l'autre ne démarre pas,
  // la première revient.
  const switchTo = async (previous: Facing, active: Media): Promise<void> => {
    turn += 1;
    const mine = turn;
    cancelReframing();
    for (const track of active.getVideoTracks()) track.stop();
    try {
      const video = await getMedia({ video: toVideoConstraints(toOtherFacing(previous), framing) });
      if (mine === turn) adopt(joinMedia(video, active), toOtherFacing(previous));
      else stopTracks(video);
    } catch (error) {
      log("Caméra : l'autre caméra n'a pas démarré, la première revient", error);
      if (mine === turn) await open(previous);
    }
  };

  return {
    start(film) {
      isRunning = true;
      facing = film.facing;
      framing = film.framing;
      kept = null;
      void open(film.facing);
    },
    switchCamera() {
      if (isRunning && live !== null) void switchTo(facing, live);
    },
    restart() {
      if (isRunning) void open(facing);
    },
    reframe() {
      cancelChecks();
      if (live === null || kept === null) return;
      budget = REFRAME_BUDGET;
      checks = REFRAME_CHECKS_MS.map((ms) => schedule(() => void reframeTrack(), ms));
    },
    interrupt,
    stop() {
      if (!isRunning) return;
      isRunning = false;
      turn += 1;
      cancelReframing();
      stopTracks(live);
      live = null;
      emit(null, "starting");
    },
  };
}
