// La durée des sounds que des rires utilisent : lue dans leur fichier (métadonnées audio), une fois par sound et par version.

import { useEffect, useState } from "react";
import type { SoundSummary } from "../../domain/sound.schema";
import { release } from "../sound-audio";
import { toSoundFileUrl } from "../sound-urls";

// `null` : le fichier n'a pas pu être lu, on ne réessaie pas.
const measured = new Map<string, number | null>();
const pending = new Set<string>();

const toKey = ({ id, version }: SoundSummary): string => `${id}|${version}`;

const measure = ({ id, version }: SoundSummary): Promise<number | null> =>
  new Promise((resolve) => {
    const audio = new Audio();
    const finish = (seconds: number | null) => {
      release(audio);
      resolve(seconds);
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () =>
      finish(Number.isFinite(audio.duration) ? audio.duration : null),
    );
    audio.addEventListener("error", () => finish(null));
    audio.src = toSoundFileUrl(id, version);
  });

// La durée (s) de chaque sound de `sounds` dont le fichier est lu, par identifiant.
export const useSoundSeconds = (sounds: readonly SoundSummary[]): ReadonlyMap<string, number> => {
  // Une durée lue redessine la timeline.
  const [, setReadCount] = useState(0);

  useEffect(() => {
    for (const sound of sounds) {
      const key = toKey(sound);
      if (measured.has(key) || pending.has(key)) continue;
      pending.add(key);
      void measure(sound).then((seconds) => {
        pending.delete(key);
        measured.set(key, seconds);
        setReadCount((count) => count + 1);
      });
    }
  }, [sounds]);

  return new Map(
    sounds.flatMap((sound) => {
      const seconds = measured.get(toKey(sound));
      return typeof seconds === "number" ? [[sound.id, seconds] as const] : [];
    }),
  );
};
