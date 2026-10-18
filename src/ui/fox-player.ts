// La lecture de la voix du renard : le WAV est joué, et son level se mesure à chaque image pour animer la bouche. La page ne
// connaît que ce petit port (SoundOutput) ; fox-audio.ts l'implémente avec Web Audio, les tests avec un faux.

import { toRms } from "../domain/fox.rules";
import { toLevel } from "../domain/mic.rules";

// La taille du bloc mesuré : 2048 échantillons, ~43 ms à 48 kHz, de quoi suivre une syllabe sans suivre chaque vibration.
export const ANALYSIS_SIZE = 2048;

// Un son en train de jouer : on peut y lire les derniers échantillons (-1 à 1), l'arrêter, et lui couper le son sans
// l'arrêter : un son muet se mesure toujours. Son fader (0 à 100 %) le baisse de la même façon, sans le couper.
export type SoundPlayback = {
  readSamples(into: Float32Array<ArrayBuffer>): void;
  stop(): void;
  setMuted(isMuted: boolean): void;
  setFader(fader: number): void;
};

export type SoundOutput = {
  // Décode le WAV et le joue, muet ou non et à ce fader dès le premier échantillon ; `onEnd` part à la fin du son (aussi quand
  // `stop` l'interrompt).
  play(encoded: ArrayBuffer, onEnd: () => void, isMuted: boolean, fader: number): Promise<SoundPlayback>;
};

export type FoxPlayerDeps = {
  output: SoundOutput;
  getSpeech: (url: string) => Promise<ArrayBuffer>;
  onError: (error: unknown) => void;
};

export type FoxPlayer = {
  // Joue le WAV de cette adresse ; il remplace celui qui parlait encore.
  play(url: string): Promise<void>;
  // Le level de la voix en dB à cet instant ; `null` quand rien ne joue.
  getLevel(): number | null;
  stop(): void;
  // Muet : la voix ne sort pas du haut-parleur mais se mesure comme avant. Vaut pour la phrase en cours et les suivantes.
  setMuted(isMuted: boolean): void;
  // Le fader de la voix (0 à 100 %, 100 au départ) : vaut pour la phrase en cours et les suivantes ; muette, elle reste muette.
  setFader(fader: number): void;
};

type Playing = { playback: SoundPlayback | undefined };

export function createFoxPlayer({ output, getSpeech, onError }: FoxPlayerDeps): FoxPlayer {
  const samples = new Float32Array(ANALYSIS_SIZE);
  let current: Playing | undefined;
  // Chaque demande a un numéro : une demande plus ancienne qui finit de charger après une plus récente se tait.
  let latest = 0;
  let isMuted = false;
  let fader = 100;

  const halt = () => {
    const previous = current;
    current = undefined;
    previous?.playback?.stop();
  };

  return {
    async play(url) {
      latest += 1;
      const mine = latest;
      halt();
      try {
        const encoded = await getSpeech(url);
        if (mine !== latest) return;
        const entry: Playing = { playback: undefined };
        entry.playback = await output.play(
          encoded,
          () => {
            if (current === entry) current = undefined;
          },
          isMuted,
          fader,
        );
        if (mine !== latest) {
          entry.playback.stop();
          return;
        }
        // Les réglages ont pu changer pendant le décodage.
        entry.playback.setMuted(isMuted);
        entry.playback.setFader(fader);
        current = entry;
      } catch (error) {
        onError(error);
      }
    },
    getLevel() {
      if (!current?.playback) return null;
      current.playback.readSamples(samples);
      return toLevel([toRms(samples)]);
    },
    // Aussi ce qui charge encore : une demande plus ancienne que l'arrêt ne sonne pas.
    stop() {
      latest += 1;
      halt();
    },
    setMuted(next) {
      isMuted = next;
      current?.playback?.setMuted(next);
    },
    setFader(next) {
      fader = next;
      current?.playback?.setFader(next);
    },
  };
}
