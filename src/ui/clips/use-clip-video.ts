// Le lecteur d'un clip vu comme un état : sa durée, l'instant affiché, s'il joue, et de quoi le piloter (se placer, lire, avancer
// d'une image, lire la partie gardée). Le <video> garde la main : ce hook ne fait que l'écouter.

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toStepIndex, toStepMiddle, toSteppedTime } from "../../domain/trim.rules";

export type ClipVideo = {
  ref: RefObject<HTMLVideoElement | null>;
  // `null` tant que le lecteur n'a pas lu les métadonnées du clip.
  duration: number | null;
  // L'instant affiché, en secondes.
  time: number;
  isPlaying: boolean;
  // L'instant lu dans le lecteur à l'instant même (`time` est un état, un peu en retard).
  getTime: () => number;
  seek: (time: number) => void;
  toggle: () => void;
  // Une image plus loin (ou plus tôt), seulement à l'arrêt.
  step: (steps: number) => void;
  // Lit de `start` à `end`, puis s'arrête sur la dernière image gardée.
  playBetween: (start: number, end: number) => void;
};

// L'instant affiché ne se redessine pas à chaque image : 20 fois par seconde suffisent à une barre.
const REDRAW_SECONDS = 0.05;

export const useClipVideo = (): ClipVideo => {
  const ref = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let animation = 0;
    let shownTime = -1;
    const show = (force: boolean) => {
      if (force || Math.abs(video.currentTime - shownTime) >= REDRAW_SECONDS) {
        shownTime = video.currentTime;
        setTime(video.currentTime);
      }
    };
    // Pendant la lecture, une boucle suit l'instant de près : elle arrête aussi la lecture de la partie gardée à sa fin.
    const follow = () => {
      const end = stopAt.current;
      if (end !== null && video.currentTime >= end) {
        video.pause();
        video.currentTime = toStepMiddle(toStepIndex(end) - 1);
        return;
      }
      show(false);
      animation = requestAnimationFrame(follow);
    };
    const updateDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : null);
    const onPlay = () => {
      setIsPlaying(true);
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(follow);
    };
    const onPause = () => {
      setIsPlaying(false);
      stopAt.current = null;
      cancelAnimationFrame(animation);
      show(true);
    };
    const onSeek = () => show(true);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) updateDuration();
    video.addEventListener("loadedmetadata", updateDuration);
    video.addEventListener("durationchange", updateDuration);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeking", onSeek);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("timeupdate", onSeek);
    return () => {
      cancelAnimationFrame(animation);
      video.removeEventListener("loadedmetadata", updateDuration);
      video.removeEventListener("durationchange", updateDuration);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeek);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("timeupdate", onSeek);
    };
  }, []);

  const getTime = useCallback(() => ref.current?.currentTime ?? 0, []);

  const seek = useCallback((next: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = next;
    setTime(next);
  }, []);

  const play = useCallback(() => {
    ref.current?.play().catch((error: unknown) => console.error("Clips : lecture refusée", error));
  }, []);

  const toggle = useCallback(() => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) play();
    else video.pause();
  }, [play]);

  const step = useCallback(
    (steps: number) => {
      const video = ref.current;
      if (!video?.paused || !Number.isFinite(video.duration)) return;
      seek(toSteppedTime(video.currentTime, steps, video.duration));
    },
    [seek],
  );

  const playBetween = useCallback(
    (start: number, end: number) => {
      stopAt.current = end;
      seek(toStepMiddle(toStepIndex(start)));
      play();
    },
    [play, seek],
  );

  return { ref, duration, time, isPlaying, getTime, seek, toggle, step, playBetween };
};
