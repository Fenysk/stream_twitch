// La caméra et le mic du téléphone : démarrés à l'ouverture (la caméra donnée, arrière pour le rôle Caméra, avant pour le Selfie),
// arrêtés dès que Safari passe en arrière-plan, relancés d'un toucher. Le flux change à chaque (re)démarrage et à chaque changement de
// caméra : c'est ce qui part vers OBS. La piste audio n'est jamais coupée sur le téléphone : c'est la coupure de la source dans OBS qui
// décide si ce mic est celui du live (le bouton micro, `useLiveMic`).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CameraOrientation,
  type Facing,
  toCameraConstraints,
  toCameraFailure,
  toOtherFacing,
  toVideoConstraints,
} from "./camera-media";

export type CameraStatus = "starting" | "live" | "interrupted" | "denied" | "unavailable";

export type CameraStream = {
  stream: MediaStream | null;
  status: CameraStatus;
  facing: Facing;
  switchCamera: () => void;
  restart: () => void;
};

const stopTracks = (stream: MediaStream | null): void => {
  for (const track of stream?.getTracks() ?? []) track.stop();
};

const toErrorName = (error: unknown): string => (error instanceof DOMException ? error.name : "");

export const useCameraStream = (firstFacing: Facing, orientation: CameraOrientation): CameraStream => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [facing, setFacing] = useState<Facing>(firstFacing);
  // Le flux en cours, pour les gestes qui n'attendent pas un rendu.
  const live = useRef<MediaStream | null>(null);
  const isMounted = useRef(true);

  const interrupt = useCallback(() => {
    stopTracks(live.current);
    live.current = null;
    setStream(null);
    setStatus("interrupted");
  }, []);

  // Une piste qui se termine sans qu'on l'ait arrêtée (Safari part en arrière-plan, un appel arrive) interrompt la caméra.
  const adopt = useCallback(
    (next: MediaStream, nextFacing: Facing) => {
      live.current = next;
      for (const track of next.getTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (live.current === next) interrupt();
          },
          { once: true },
        );
      }
      setStream(next);
      setFacing(nextFacing);
      setStatus("live");
    },
    [interrupt],
  );

  const start = useCallback(
    async (nextFacing: Facing) => {
      stopTracks(live.current);
      live.current = null;
      setStream(null);
      setStatus("starting");
      try {
        const next = await navigator.mediaDevices.getUserMedia(toCameraConstraints(nextFacing, orientation));
        if (isMounted.current) adopt(next, nextFacing);
        else stopTracks(next);
      } catch (error) {
        console.warn("Caméra : le téléphone n'a pas donné la caméra", error);
        if (isMounted.current) setStatus(toCameraFailure(toErrorName(error)));
      }
    },
    [adopt, orientation],
  );

  // L'autre caméra : l'ancienne image s'arrête avant (un iPhone n'ouvre pas deux caméras), le mic continue. Si l'autre ne démarre pas,
  // la première revient.
  const switchTo = useCallback(
    async (previous: Facing) => {
      const active = live.current;
      if (!active) return;
      for (const track of active.getVideoTracks()) track.stop();
      try {
        const video = await navigator.mediaDevices.getUserMedia({
          video: toVideoConstraints(toOtherFacing(previous), orientation),
        });
        if (!isMounted.current) stopTracks(video);
        else
          adopt(
            new MediaStream([...video.getVideoTracks(), ...active.getAudioTracks()]),
            toOtherFacing(previous),
          );
      } catch (error) {
        console.warn("Caméra : l'autre caméra n'a pas démarré, la première revient", error);
        if (isMounted.current) await start(previous);
      }
    },
    [adopt, start, orientation],
  );

  useEffect(() => {
    isMounted.current = true;
    void start(firstFacing);
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && live.current) interrupt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      isMounted.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      stopTracks(live.current);
      live.current = null;
    };
  }, [start, interrupt, firstFacing]);

  return {
    stream,
    status,
    facing,
    switchCamera: () => void switchTo(facing),
    restart: () => void start(facing),
  };
};
