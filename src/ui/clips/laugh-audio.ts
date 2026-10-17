// Le lecteur audio des rires de l'aperçu : un <audio> par rire qui joue, pris dans une réserve où les fichiers des sounds sont préchargés
// (un rire part sans attendre le réseau) et rendu à la fin ou à la coupure. Le même sound peut jouer deux fois en même temps.

import { release } from "../sound-audio";
import { toSoundFileUrl } from "../sound-urls";
import type { PreviewAudio, PreviewSound } from "./laugh-preview";

export type LaughAudio = PreviewAudio & {
  // Précharge le fichier de chaque sound, une fois par sound et par version.
  preload(sounds: readonly PreviewSound[]): void;
  // Coupe tout et libère les fichiers : le clip change, l'éditeur se ferme.
  dispose(): void;
};

const toKey = ({ id, version }: PreviewSound): string => `${id}|${version}`;

export const createLaughAudio = (): LaughAudio => {
  const idle = new Map<string, HTMLAudioElement[]>();
  const all = new Set<HTMLAudioElement>();

  const create = (sound: PreviewSound): HTMLAudioElement => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = toSoundFileUrl(sound.id, sound.version);
    all.add(audio);
    return audio;
  };

  return {
    preload(sounds) {
      for (const sound of sounds) {
        const key = toKey(sound);
        if (!idle.has(key)) idle.set(key, [create(sound)]);
      }
    },
    play(sound, fader, offset) {
      const key = toKey(sound);
      const audio = idle.get(key)?.pop() ?? create(sound);
      let isGivenBack = false;
      const giveBack = () => {
        if (isGivenBack) return;
        isGivenBack = true;
        audio.removeEventListener("ended", giveBack);
        audio.pause();
        audio.currentTime = 0;
        idle.set(key, [...(idle.get(key) ?? []), audio]);
      };
      audio.volume = fader / 100;
      audio.currentTime = offset;
      audio.addEventListener("ended", giveBack);
      audio.play().catch((error: unknown) => {
        // Coupé avant d'être parti (pause ou déplacement tout de suite après) : ce n'est pas une erreur.
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Clips : le rire ne joue pas", error);
        giveBack();
      });
      return {
        stop: giveBack,
        update: (next) => {
          audio.volume = next / 100;
        },
      };
    },
    dispose() {
      for (const audio of all) release(audio);
      all.clear();
      idle.clear();
    },
  };
};
