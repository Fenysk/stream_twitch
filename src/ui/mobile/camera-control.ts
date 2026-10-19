// La caméra et le mic du téléphone, sans le navigateur : démarrés par Filmer (l'objectif et le cadrage pris à l'appui), arrêtés quand le
// téléphone arrête de filmer ou que Safari passe en arrière-plan, relancés d'un toucher. `Media` est le flux de la caméra (un MediaStream dans
// le navigateur). Le flux change à chaque (re)démarrage et à chaque changement d'objectif : c'est ce qui part vers OBS. La piste audio n'est
// jamais coupée sur le téléphone : c'est la coupure de la source dans OBS qui décide si ce mic est celui du live (`useLiveMic`). Rien ici ne
// lit l'orientation du téléphone : elle ne relance ni ne change rien.

import type { Facing, FilmStart, Orientation } from "../../domain/phone-layout.rules";
import { toCameraConstraints, toCameraFailure, toOtherFacing, toVideoConstraints } from "./camera-media";

export type CameraStatus = "starting" | "live" | "interrupted" | "denied" | "unavailable";

export type CameraTrack = {
  stop(): void;
  addEventListener(type: "ended", listener: () => void, options: { once: true }): void;
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
  log(message: string, error?: unknown): void;
};

export type CameraControl = {
  // Filmer : démarre la caméra avec l'objectif et le cadrage pris à l'appui, qui ne changent plus jusqu'à l'arrêt.
  start(film: FilmStart): void;
  // L'autre objectif, avec le même cadrage. Rien sans caméra en marche.
  switchCamera(): void;
  // Relance la caméra d'un toucher (interrompue, refusée, introuvable), même objectif et même cadrage.
  restart(): void;
  // Safari part en arrière-plan : arrête la caméra en marche, qui se relance d'un toucher.
  interrupt(): void;
  // Le téléphone arrête de filmer.
  stop(): void;
};

const stopTracks = (media: CameraMedia | null): void => {
  for (const track of media?.getTracks() ?? []) track.stop();
};

const toErrorName = (error: unknown): string => (error instanceof DOMException ? error.name : "");

export function createCameraControl<Media extends CameraMedia>({
  getMedia,
  joinMedia,
  onChange,
  log,
}: CameraControlDeps<Media>): CameraControl {
  let live: Media | null = null;
  let facing: Facing = "environment";
  let framing: Orientation = "landscape";
  let isRunning = false;
  // Chaque démarrage, changement d'objectif et arrêt prend un tour : la réponse d'une demande plus ancienne est jetée.
  let turn = 0;

  const emit = (stream: Media | null, status: CameraStatus): void => onChange({ stream, status, facing });

  const interrupt = (): void => {
    if (live === null) return;
    stopTracks(live);
    live = null;
    emit(null, "interrupted");
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
  };

  const open = async (nextFacing: Facing): Promise<void> => {
    turn += 1;
    const mine = turn;
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
      void open(film.facing);
    },
    switchCamera() {
      if (isRunning && live !== null) void switchTo(facing, live);
    },
    restart() {
      if (isRunning) void open(facing);
    },
    interrupt,
    stop() {
      if (!isRunning) return;
      isRunning = false;
      turn += 1;
      stopTracks(live);
      live = null;
      emit(null, "starting");
    },
  };
}
