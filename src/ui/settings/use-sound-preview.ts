// « Écouter » : le son se joue dans la page des réglages, à son fader, sans passer par le serveur ni par OBS. Un deuxième clic
// sur le même son l'arrête ; en lancer un autre arrête le premier.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SoundSummary } from "../../domain/sound.schema";
import { toSoundFileUrl } from "../sound-urls";

export type UseSoundPreview = {
  // Le son qu'on écoute en ce moment.
  playingId: string | null;
  error: string | null;
  toggle: (sound: SoundSummary) => void;
};

export const useSoundPreview = (): UseSoundPreview => {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const halt = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPlayingId(null);
  }, []);

  useEffect(() => halt, [halt]);

  const toggle = useCallback(
    (sound: SoundSummary) => {
      const wasPlaying = audio.current !== null && playingId === sound.id;
      halt();
      setError(null);
      if (wasPlaying) return;
      const next = new Audio(toSoundFileUrl(sound.id, sound.version));
      next.volume = sound.fader / 100;
      next.addEventListener("ended", () => {
        if (audio.current === next) halt();
      });
      audio.current = next;
      setPlayingId(sound.id);
      next.play().catch((failure: unknown) => {
        console.error("Sons : l'écoute ne démarre pas", failure);
        if (audio.current === next) halt();
        setError("Le navigateur ne peut pas jouer ce fichier.");
      });
    },
    [halt, playingId],
  );

  return { playingId, error, toggle };
};
