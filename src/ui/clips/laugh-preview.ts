// Les rires pendant l'aperçu du clip dans l'éditeur : ils partent à leur instant quand la lecture passe dessus, comme dans `/show`.

import type { ClipLaugh } from "../../domain/clip.schema";
import { toLaughFader } from "../../domain/laugh.rules";
import {
  isAtKeptEnd,
  toLaughsDue,
  toLaughsUnderway,
  type UnderwayLaugh,
} from "../../domain/laugh-preview.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import type { Trim } from "../../domain/trim.rules";

// Le sound d'un rire tel que la soundboard l'a : de quoi trouver son fichier (version) et sa force de base (fader).
export type PreviewSound = Pick<SoundSummary, "id" | "version" | "fader">;

// Un rire qui joue : on peut le couper, ou changer sa force pendant qu'il joue.
export type PlayingLaugh = { stop(): void; update(fader: number): void };

// Le lecteur audio : joue un sound à cette force (fader de 0 à 100) depuis `offset` secondes, par-dessus le clip.
export type PreviewAudio = { play(sound: PreviewSound, fader: number, offset: number): PlayingLaugh };

// Ce que l'aperçu lit à chaque pas, pour suivre ce que l'éditeur change pendant la lecture. `laughFader` : le volume des rires du clip
// (0 à 100). `origin` : l'instant du clip brut où la vidéo lue commence.
export type PreviewSource = {
  laughs: readonly ClipLaugh[];
  sounds: readonly PreviewSound[];
  seconds: ReadonlyMap<string, number>;
  kept: Trim;
  laughFader: number;
  origin: number;
};

export type PreviewState = "idle" | "running" | "finishing";

export type LaughPreview = {
  state(): PreviewState;
  start(position: number): void;
  tick(position: number): void;
  stop(): void;
  seek(position: number): void;
  finish(): void;
  refresh(): void;
};

// La position saute de plus que ça, en avant ou en arrière (onglet en arrière-plan, déplacement sans évènement) : la lecture reprend selon
// sa nouvelle position.
const RESYNC_SECONDS = 0.5;
// Deux positions plus proches que ça sont la même.
const SAME_SECONDS = 0.05;

// Joue les rires au rythme de la lecture, en secondes du clip brut : `start` quand elle démarre ou reprend (les rires en route repartent
// du bon endroit), `tick` à chaque pas, `stop` à la pause ou au déplacement (tout est coupé), `finish` quand elle s'arrête seule à la fin
// gardée ou de la vidéo (les rires pas encore partis partent, ceux qui jouent vont au bout), `seek` quand elle est déplacée (tout est coupé, sauf si
// elle a déjà repris à cette position), `refresh` quand le volume des rires change.
export const createLaughPreview = (
  audio: PreviewAudio,
  getSource: () => PreviewSource | null,
): LaughPreview => {
  let state: PreviewState = "idle";
  let from = 0;
  // Les rires qui jouent, avec leur sound : de quoi les couper et changer leur force.
  let playing: { handle: PlayingLaugh; sound: PreviewSound }[] = [];

  const silence = () => {
    for (const { handle } of playing) handle.stop();
    playing = [];
  };

  const launch = (source: PreviewSource, entries: readonly UnderwayLaugh<ClipLaugh>[]) => {
    for (const { laugh, offset } of entries) {
      const sound = source.sounds.find(({ id }) => id === laugh.sound);
      if (!sound) continue;
      playing.push({
        handle: audio.play(sound, toLaughFader(sound.fader, source.laughFader), offset),
        sound,
      });
    }
  };

  // Les rires qui partent jusqu'à `to` : ils partent maintenant, depuis leur début.
  const toDueEntries = (source: PreviewSource, to: number): UnderwayLaugh<ClipLaugh>[] =>
    toLaughsDue(source.laughs, from, to, source.kept).map((laugh) => ({ laugh, offset: 0 }));

  const stop = () => {
    state = "idle";
    silence();
  };

  const start = (position: number) => {
    silence();
    state = "running";
    from = position;
    const source = getSource();
    if (source) launch(source, toLaughsUnderway(source.laughs, position, source.seconds, source.kept));
  };

  return {
    state: () => state,
    start,
    tick(position) {
      if (state !== "running") return;
      if (Math.abs(position - from) > RESYNC_SECONDS) return start(position);
      const source = getSource();
      if (source) launch(source, toDueEntries(source, position));
      // Le lecteur arrondit sa position : un souffle en arrière ne fait pas repartir un rire déjà parti.
      from = Math.max(from, position);
    },
    stop,
    seek(position) {
      // Le pas d'animation voit parfois le saut avant l'évènement du lecteur : il a déjà repris à cette position, rien à couper.
      if (state === "running" && Math.abs(position - from) < SAME_SECONDS) return;
      stop();
    },
    finish() {
      if (state !== "running") return;
      state = "finishing";
      const source = getSource();
      if (source) launch(source, toDueEntries(source, Number.POSITIVE_INFINITY));
    },
    refresh() {
      const source = getSource();
      if (!source) return;
      for (const { handle, sound } of playing) handle.update(toLaughFader(sound.fader, source.laughFader));
    },
  };
};

// Le <video> vu de l'aperçu : ses évènements et ce qu'il dit de la lecture.
export type PreviewVideo = EventTarget & { currentTime: number; paused: boolean; ended: boolean };

// Un pas par image d'animation (`requestAnimationFrame` dans le navigateur).
export type AnimationLoop = { request(callback: () => void): number; cancel(id: number): void };

// Branche l'aperçu sur le lecteur : la position est suivie à chaque image d'animation pendant la lecture (`timeupdate` n'arrive que quatre
// fois par seconde, trop tard pour un rire). Rend de quoi débrancher.
export const connectLaughPreview = (
  video: PreviewVideo,
  preview: LaughPreview,
  getSource: () => PreviewSource | null,
  animation: AnimationLoop,
): (() => void) => {
  let step: number | undefined;
  const toPosition = () => video.currentTime + (getSource()?.origin ?? 0);
  // La lecture s'est arrêtée d'elle-même : la vidéo est finie, ou la sélection a atteint sa fin gardée (le lecteur se replace alors sur sa
  // dernière image gardée).
  const isEnd = () => {
    const kept = getSource()?.kept;
    return video.ended || (kept !== undefined && isAtKeptEnd(toPosition(), kept));
  };
  const follow = () => {
    preview.tick(toPosition());
    step = animation.request(follow);
  };
  const stopFollowing = () => {
    if (step !== undefined) animation.cancel(step);
    step = undefined;
  };
  const onPlay = () => {
    stopFollowing();
    preview.start(toPosition());
    step = animation.request(follow);
  };
  const onPause = () => {
    stopFollowing();
    if (isEnd()) preview.finish();
    else preview.stop();
  };
  const onEnded = () => {
    stopFollowing();
    preview.finish();
  };
  // Le déplacement qui suit l'arrêt de la sélection est celui du lecteur lui-même : les rires qui finissent jouent jusqu'au bout.
  const onSeeking = () => {
    if (preview.state() === "finishing" && isEnd()) return;
    preview.seek(toPosition());
  };
  // Un déplacement pendant la lecture : elle continue, les rires reprennent selon la nouvelle position (sauf si `play` l'a déjà fait).
  const onSeeked = () => {
    if (!video.paused && preview.state() === "idle") onPlay();
  };
  const listeners = [
    ["play", onPlay],
    ["pause", onPause],
    ["ended", onEnded],
    ["seeking", onSeeking],
    ["seeked", onSeeked],
  ] as const;
  for (const [type, listener] of listeners) video.addEventListener(type, listener);
  return () => {
    stopFollowing();
    for (const [type, listener] of listeners) video.removeEventListener(type, listener);
  };
};
