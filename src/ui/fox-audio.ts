// Web Audio côté page : le seul fichier qui touche à l'API du navigateur ; fox-player.ts n'en connaît que le port.

import { ANALYSIS_SIZE, type SoundOutput } from "./fox-player";

// Un seul contexte par page, créé à la demande. Dans OBS il sonne tout de suite ; dans un navigateur ordinaire il attend
// un geste de l'utilisateur (règle d'autoplay) : `unlockSound` s'appelle depuis un clic.
let shared: AudioContext | undefined;

const getContext = (): AudioContext | undefined => {
  if (typeof AudioContext === "undefined") return undefined;
  shared ??= new AudioContext();
  return shared;
};

export const unlockSound = (): void => {
  void getContext()?.resume();
};

// Un contexte bloqué ne répond pas à `resume` : on n'attend pas plus, et la voix ne part pas (elle sonnerait en retard au
// premier clic de la page, sans rapport avec la phrase).
const BLOCKED_WAIT_MS = 100;

const toSoundOutput = (context: AudioContext): SoundOutput => ({
  async play(encoded, onEnd, isMuted, startFader) {
    const buffer = await context.decodeAudioData(encoded);
    if (context.state !== "running") {
      await Promise.race([context.resume(), new Promise((done) => setTimeout(done, BLOCKED_WAIT_MS))]);
    }
    if (context.state !== "running") {
      throw new Error("le navigateur bloque le son : un clic dans la page l'autorise");
    }
    const source = context.createBufferSource();
    const analyser = context.createAnalyser();
    // Un gain à 0 coupe le son sans couper le graphe, un gain plus bas le baisse de même : l'analyseur, placé avant, mesure toujours
    // la voix entière.
    const fader = context.createGain();
    let isMutedNow = isMuted;
    let faderNow = startFader;
    const applyFader = () => {
      fader.gain.value = isMutedNow ? 0 : faderNow / 100;
    };
    analyser.fftSize = ANALYSIS_SIZE;
    applyFader();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(fader);
    fader.connect(context.destination);
    source.onended = () => onEnd();
    source.start();
    return {
      readSamples: (into) => analyser.getFloatTimeDomainData(into),
      stop: () => source.stop(),
      setMuted: (next) => {
        isMutedNow = next;
        applyFader();
      },
      setFader: (next) => {
        faderNow = next;
        applyFader();
      },
    };
  },
});

export const getSoundOutput = (): SoundOutput | undefined => {
  const context = getContext();
  return context && toSoundOutput(context);
};
