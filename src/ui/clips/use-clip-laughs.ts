// Les rires d'un clip dans l'éditeur : ce que la timeline en montre, et de quoi les poser, les glisser, changer leur sound et les retirer.
// Les rires sont en secondes du clip brut ; `origin` : l'instant du clip brut où la vidéo lue commence.

import { useEffect, useMemo, useReducer, useState } from "react";
import type { ClipLaugh } from "../../domain/clip.schema";
import { toDefaultSound, toKnownLaughs, toLaughAt } from "../../domain/laugh.rules";
import type { SoundSummary } from "../../domain/sound.schema";
import { type Trim, toStepIndex, toStepMiddle, toStepStart } from "../../domain/trim.rules";
import {
  createLaughsState,
  type LaughBlock,
  type LaughDetails,
  type LaughView,
  reduceLaughs,
  toLaughBlocks,
  toLaughDetails,
  toLaughRequests,
  toUsedSounds,
} from "./clip-laughs";
import { getLastLaughSound, updateLastLaughSound } from "./last-laugh-sound";
import type { ClipVideo } from "./use-clip-video";
import { useSoundSeconds } from "./use-sound-seconds";

type ClipLaughsInput = {
  // Les rires déjà posés sur le clip ; sans eux, aucun.
  initial: readonly ClipLaugh[] | undefined;
  // `null` tant que la soundboard n'est pas lue.
  sounds: readonly SoundSummary[] | null;
  video: ClipVideo;
  // La partie gardée, en secondes du clip brut ; `null` tant que la durée du clip n'est pas connue.
  kept: Trim | null;
  // L'instant du clip brut où la vidéo lue commence.
  origin: number;
};

export type ClipLaughs = {
  blocks: readonly LaughBlock[];
  // Le rire choisi, `null` : aucun.
  details: LaughDetails | null;
  // Un rire se pose : la durée du clip est connue et la soundboard a un sound.
  canCreate: boolean;
  // La soundboard est lue et vide : il n'y a aucun sound à poser.
  isSoundboardEmpty: boolean;
  // Ce que le serveur reçoit : les rires dont le sound est encore dans la soundboard.
  requests: ClipLaugh[];
  // Pose un rire à la position de lecture, avec le dernier sound choisi, et le choisit.
  create: () => void;
  choose: (key: number) => void;
  // Déplace un rire à cet instant de la vidéo lue (calé sur une image, borné à la partie gardée) et montre l'image où il commence.
  move: (key: number, time: number) => void;
  // Change le sound du rire choisi.
  update: (sound: string) => void;
  // Retire le rire choisi.
  delete: () => void;
};

export const useClipLaughs = ({ initial, sounds, video, kept, origin }: ClipLaughsInput): ClipLaughs => {
  const [state, dispatch] = useReducer(reduceLaughs, initial, createLaughsState);
  // Lu après l'affichage : le rendu serveur n'a pas de `localStorage`.
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => setLast(getLastLaughSound()), []);

  const known = useMemo(() => toKnownLaughs(state.laughs, sounds), [state.laughs, sounds]);
  const used = useMemo(() => toUsedSounds(known, sounds), [known, sounds]);
  const seconds = useSoundSeconds(used);
  const view: LaughView | null = kept && { sounds, seconds, kept, origin };
  const defaultSound = toDefaultSound(sounds, last);

  const remember = (sound: string) => {
    setLast(sound);
    updateLastLaughSound(sound);
  };
  const details = view && toLaughDetails(known, state.selectedKey, view);

  return {
    blocks: view ? toLaughBlocks(known, state.selectedKey, view) : [],
    details,
    canCreate: kept !== null && defaultSound !== undefined,
    isSoundboardEmpty: sounds !== null && sounds.length === 0,
    requests: toLaughRequests(known),
    create: () => {
      if (!kept || defaultSound === undefined) return;
      dispatch({
        kind: "create",
        at: toLaughAt(toStepStart(video.getTime() + origin), kept),
        sound: defaultSound,
      });
      remember(defaultSound);
    },
    choose: (key) => dispatch({ kind: "choose", key }),
    move: (key, time) => {
      if (!kept) return;
      const at = toLaughAt(time + origin, kept);
      dispatch({ kind: "move", key, at });
      video.seek(toStepMiddle(toStepIndex(at - origin)));
    },
    update: (sound) => {
      if (!details) return;
      dispatch({ kind: "update", key: details.key, sound });
      remember(sound);
    },
    delete: () => {
      if (details) dispatch({ kind: "delete", key: details.key });
    },
  };
};
