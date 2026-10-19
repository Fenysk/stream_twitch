// La caméra et le mic du téléphone dans la page : démarrés par Filmer (`film`, l'objectif et le cadrage pris à l'appui), arrêtés quand `film`
// redevient vide. La logique est dans `camera-control.ts` ; ici, le navigateur (`getUserMedia`, Safari en arrière-plan). `film` est la seule
// entrée : l'orientation du téléphone n'en est pas une, la rotation ne relance jamais la caméra.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Facing, FilmStart } from "../../domain/phone-layout.rules";
import {
  type CameraControl,
  type CameraState,
  type CameraStatus,
  createCameraControl,
} from "./camera-control";

export type CameraStream = {
  stream: MediaStream | null;
  status: CameraStatus;
  facing: Facing;
  switchCamera: () => void;
  restart: () => void;
};

export const useCameraStream = (film: FilmStart | null): CameraStream => {
  const [state, setState] = useState<CameraState<MediaStream>>({
    stream: null,
    status: "starting",
    facing: film?.facing ?? "environment",
  });
  const control = useRef<CameraControl | null>(null);

  useEffect(() => {
    const next = createCameraControl<MediaStream>({
      getMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      joinMedia: (video, audio) => new MediaStream([...video.getVideoTracks(), ...audio.getAudioTracks()]),
      onChange: setState,
      log: (message, error) => console.warn(message, error),
    });
    control.current = next;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") next.interrupt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      next.stop();
      control.current = null;
    };
  }, []);

  useEffect(() => {
    if (film) control.current?.start(film);
    else control.current?.stop();
  }, [film]);

  const switchCamera = useCallback(() => control.current?.switchCamera(), []);
  const restart = useCallback(() => control.current?.restart(), []);
  return { ...state, switchCamera, restart };
};
