// Les raccourcis du lecteur (domain/trim.rules.ts, toClipKey) : I et O posent le début et la fin à la position de lecture, R pose un rire
// à la position de lecture, Suppr retire le rire choisi, les flèches avancent d'une image quand la vidéo est en pause, Espace lit ou
// arrête. Ils se taisent dans un champ de saisie, sur un bouton et sur une poignée (qui ont leurs propres touches). Un bloc de rire ne
// garde que les flèches : I, O, R, Espace et Suppr marchent encore quand il a le focus.

import { useEffect, useRef } from "react";
import {
  type ClipKey,
  type Trim,
  toClipKey,
  toEndAt,
  toStartAt,
  toStepEnd,
  toStepStart,
} from "../../domain/trim.rules";
import type { ClipVideo } from "./use-clip-video";

type ClipKeys = {
  video: ClipVideo;
  // `null` tant que la durée du clip n'est pas connue : I et O attendent.
  trim: Trim | null;
  onTrimChange: (trim: Trim) => void;
  // R : pose un rire à la position de lecture. Suppr : retire le rire choisi.
  onLaugh: () => void;
  onDelete: () => void;
  isEnabled: boolean;
  // Le début et la fin ne se changent pas (le clip brut d'origine n'est plus là) : I et O ne font rien.
  isTrimLocked: boolean;
};

const OWN_KEYS = "input, textarea, select, button, a, [role='slider'], [contenteditable='true']";
const LAUGH_BLOCK = "[data-laugh-block]";

const isArrow = (key: ClipKey): boolean => key === "back" || key === "forward";

const hasOwnKeys = (target: EventTarget | null, key: ClipKey): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest(LAUGH_BLOCK)) return isArrow(key);
  return target.closest(OWN_KEYS) !== null;
};

type KeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "defaultPrevented" | "target">;

// La touche que le raccourci traite, ou rien : la page la laisse alors au navigateur.
export const toHandledKey = (
  event: KeyEvent,
  {
    video,
    isEnabled,
    isTrimLocked,
  }: Pick<ClipKeys, "isEnabled" | "isTrimLocked"> & { video: Pick<ClipVideo, "ref"> },
): ClipKey | undefined => {
  const key = toClipKey(event.key);
  if (!key || !isEnabled || event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (event.defaultPrevented || hasOwnKeys(event.target, key)) return undefined;
  if (isTrimLocked && (key === "start" || key === "end")) return undefined;
  // En lecture, les flèches gardent leur rôle du navigateur (reculer ou avancer de 5 s).
  return isArrow(key) && video.ref.current?.paused === false ? undefined : key;
};

const applyKey = (key: ClipKey, keys: ClipKeys): void => {
  const { video, trim, onTrimChange } = keys;
  if (key === "toggle") video.toggle();
  else if (key === "back") video.step(-1);
  else if (key === "forward") video.step(1);
  else if (key === "laugh") keys.onLaugh();
  else if (key === "delete") keys.onDelete();
  else if (trim && video.duration !== null) {
    onTrimChange(
      key === "start"
        ? toStartAt(trim, toStepStart(video.getTime()))
        : toEndAt(trim, toStepEnd(video.getTime()), video.duration),
    );
  }
};

export const useClipKeys = (keys: ClipKeys): void => {
  // Le raccourci lit toujours les dernières valeurs : l'écouteur n'est posé qu'une fois.
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = toHandledKey(event, latest.current);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      applyKey(key, latest.current);
    };
    // En capture : le lecteur et ses contrôles natifs ne traitent pas la touche avant nous.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
};
