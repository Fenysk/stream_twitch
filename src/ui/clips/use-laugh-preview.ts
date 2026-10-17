// Les rires pendant l'aperçu du clip : ce hook branche laugh-preview.ts sur le <video> du plan de travail, avec un lecteur audio dont les
// fichiers sont préchargés. Changer de clip, fermer l'éditeur ou quitter l'onglet démonte le plan de travail : tout est coupé et libéré.

import { useEffect, useRef } from "react";
import type { ClipLaugh } from "../../domain/clip.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import type { Trim } from "../../domain/trim.rules";
import { createLaughAudio, type LaughAudio } from "./laugh-audio";
import {
  type AnimationLoop,
  connectLaughPreview,
  createLaughPreview,
  type LaughPreview,
  type PreviewSource,
} from "./laugh-preview";
import type { ClipVideo } from "./use-clip-video";

type LaughPreviewInput = {
  video: ClipVideo;
  // Les rires dont le sound est dans la soundboard, et les sounds qu'ils utilisent.
  laughs: readonly ClipLaugh[];
  usedSounds: readonly SoundSummary[];
  // La durée des sounds dont le fichier est lu, par identifiant de sound.
  seconds: ReadonlyMap<string, number>;
  // Le volume des rires du clip, de 0 à 100.
  laughFader: number;
  // La partie gardée, en secondes du clip brut ; `null` tant que la durée du clip n'est pas connue.
  kept: Trim | null;
  // L'instant du clip brut où la vidéo lue commence.
  origin: number;
};

const ANIMATION: AnimationLoop = {
  request: (callback) => requestAnimationFrame(() => callback()),
  cancel: (id) => cancelAnimationFrame(id),
};

export const useLaughPreview = ({
  video,
  laughs,
  usedSounds,
  seconds,
  laughFader,
  kept,
  origin,
}: LaughPreviewInput): void => {
  // L'aperçu relit ces valeurs à chaque pas : un rire posé ou un volume changé pendant la lecture compte aussitôt.
  const latest = useRef<PreviewSource | null>(null);
  latest.current = kept && { laughs, sounds: usedSounds, seconds, kept, laughFader, origin };
  const audio = useRef<LaughAudio | null>(null);
  const preview = useRef<LaughPreview | null>(null);

  useEffect(() => {
    const element = video.ref.current;
    if (!element) return;
    const player = createLaughAudio();
    const laughPreview = createLaughPreview(player, () => latest.current);
    const disconnect = connectLaughPreview(element, laughPreview, () => latest.current, ANIMATION);
    audio.current = player;
    preview.current = laughPreview;
    return () => {
      disconnect();
      laughPreview.stop();
      player.dispose();
      audio.current = null;
      preview.current = null;
    };
  }, [video.ref]);

  // Les fichiers des sounds utilisés se préchargent : un rire part sans attendre le réseau.
  useEffect(() => {
    audio.current?.preload(usedSounds);
  }, [usedSounds]);

  // Le volume des rires qui jouent suit le curseur aussitôt (après chaque rendu : les valeurs lues sont celles de `latest`).
  useEffect(() => {
    preview.current?.refresh();
  });
};
