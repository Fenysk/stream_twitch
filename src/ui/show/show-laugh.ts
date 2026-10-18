// Les fichiers de rire de la page `/show` : un téléchargement par sound et par version et par émission, avant que le clip joue. OBS limite
// ses sources navigateur à 6 connexions par hôte : un rire ne rouvre aucune connexion pendant le clip.

import type { ShowLaugh } from "../../domain/show.schema";
import { release } from "../sound-audio";
import { toSoundFileUrl } from "../sound-urls";

export type LaughFiles = {
  // Télécharge les fichiers de ces rires, l'un après l'autre ; ceux déjà demandés (même sound, même version) ne le sont pas deux fois.
  // Ne lève jamais : un fichier raté est dit dans la console et jouera depuis le réseau.
  prepare(laughs: readonly ShowLaugh[]): Promise<void>;
  // Joue le rire par-dessus le son du clip ; `false` quand il ne joue pas (fichier supprimé ou illisible, lecture refusée) ou que
  // l'émission s'arrête : alors le son est coupé aussitôt. `true` : il a joué jusqu'au bout.
  play(laugh: ShowLaugh): Promise<boolean>;
  // Le fader de l'émission (0 à 100 %, 100 au départ) : chaque rire joue à son fader × celui-ci, ceux qui jouent déjà comme ceux qui partiront.
  setFader(fader: number): void;
  // Libère les adresses d'objet des fichiers téléchargés.
  clear(): void;
};

// Un fichier qui n'arrive pas en 30 s est tenu pour perdu.
const DOWNLOAD_LIMIT_MS = 30_000;

const toKey = ({ id, version }: ShowLaugh): string => `${id}|${version}`;

// `aborted` se résout quand l'émission s'arrête : les téléchargements s'interrompent, les rires qui jouent se coupent.
export const createLaughFiles = (aborted: Promise<void>): LaughFiles => {
  const downloads = new Map<string, Promise<void>>();
  const urls = new Map<string, string>();
  // Les rires qui jouent, avec leur fader propre ; le fader de l'émission s'y applique à tous, au départ comme en route.
  const playing = new Map<HTMLAudioElement, number>();
  let showFader = 100;
  let isCleared = false;

  // Le facteur (0 à 1) de l'<audio> : le fader d'un rire fois celui de l'émission.
  const toMixedFader = (fader: number): number => (fader * showFader) / 10_000;

  const download = async (laugh: ShowLaugh): Promise<void> => {
    const interruption = new AbortController();
    void aborted.then(() => interruption.abort());
    const timer = setTimeout(() => interruption.abort(), DOWNLOAD_LIMIT_MS);
    try {
      const response = await fetch(toSoundFileUrl(laugh.id, laugh.version), { signal: interruption.signal });
      if (!response.ok) throw new Error(`le serveur répond ${response.status}`);
      const blob = await response.blob();
      if (!isCleared) urls.set(toKey(laugh), URL.createObjectURL(blob));
    } catch (error) {
      console.error(
        `Émission : le rire « ${laugh.id} » ne se télécharge pas, il jouera depuis le réseau`,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async prepare(laughs) {
      for (const laugh of laughs) {
        if (isCleared) return;
        const key = toKey(laugh);
        const known = downloads.get(key);
        const pending = known ?? download(laugh);
        if (!known) downloads.set(key, pending);
        await pending;
      }
    },
    play: (laugh) =>
      new Promise((resolve) => {
        const audio = new Audio(urls.get(toKey(laugh)) ?? toSoundFileUrl(laugh.id, laugh.version));
        playing.set(audio, laugh.fader);
        audio.volume = toMixedFader(laugh.fader);
        const finish = (isPlayed: boolean) => {
          playing.delete(audio);
          release(audio);
          resolve(isPlayed);
        };
        audio.addEventListener("ended", () => finish(true));
        audio.addEventListener("error", () => finish(false));
        void aborted.then(() => finish(false));
        audio.play().catch((error: unknown) => {
          console.error("Émission : les rires ne jouent pas", error);
          finish(false);
        });
      }),
    setFader(fader) {
      showFader = fader;
      for (const [audio, own] of playing) audio.volume = toMixedFader(own);
    },
    clear() {
      isCleared = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
};
