// L'audio d'un son côté page : le seul fichier qui touche à l'élément <audio> du navigateur ; sound-screen.ts n'en connaît
// que le port. Dans OBS il sonne tout de suite ; dans un navigateur ordinaire il attend un premier clic (règle d'autoplay).

import type { SoundPlayer } from "./sound-screen";
import { toSoundFileUrl } from "./sound-urls";

const BLOCKED_REASON = "le navigateur bloque le son : un clic dans la page l'autorise";

// Un son arrêté ne parle plus : la page libère le fichier, sans que `ended` ni `error` ne s'en mêlent.
const release = (audio: HTMLAudioElement): void => {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
};

export const createAudioPlayer = (): SoundPlayer => ({
  start({ soundId, version, fader }, { onEnd, onFail }) {
    const audio = new Audio(toSoundFileUrl(soundId, version));
    let isStopped = false;
    audio.volume = fader / 100;
    audio.addEventListener("ended", () => {
      if (!isStopped) onEnd();
    });
    audio.addEventListener("error", () => {
      if (!isStopped) onFail("fichier illisible");
    });
    audio.play().catch((error: unknown) => {
      if (isStopped) return;
      onFail(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? BLOCKED_REASON
          : "lecture impossible",
      );
    });
    return {
      stop() {
        isStopped = true;
        release(audio);
      },
    };
  },
});
