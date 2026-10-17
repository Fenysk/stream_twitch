// Un <video> de la page `/show` vu comme deux promesses : le préparer, et le jouer jusqu'au bout.

// Un clip qui n'est pas prêt après 30 s ne se lit pas ; un clip qui n'avance plus 30 s après sa durée est tenu pour fini.
const READY_LIMIT_MS = 30_000;
const STALL_LIMIT_MS = 30_000;

// Donne `url` à la vidéo : rend `true` quand elle peut jouer, `false` quand le fichier échoue ou tarde trop.
export const prepareVideo = (video: HTMLVideoElement, url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const finish = (isReady: boolean) => {
      clearTimeout(timer);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      resolve(isReady);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), READY_LIMIT_MS);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.preload = "auto";
    video.src = url;
    video.load();
  });

// Lance la lecture avec le son ; un navigateur qui la refuse (hors OBS, sans geste de l'utilisateur) la reçoit muette plutôt que bloquée.
const startVideo = async (video: HTMLVideoElement): Promise<boolean> => {
  video.muted = false;
  try {
    await video.play();
    return true;
  } catch (error) {
    console.error("Émission : lecture avec le son refusée, la vidéo passe en muet", error);
  }
  video.muted = true;
  try {
    await video.play();
    return true;
  } catch (error) {
    console.error("Émission : lecture impossible", error);
    return false;
  }
};

// La page lit la position de la vidéo 10 fois par seconde pour y caler le tchat et les sursauts.
const TIME_STEP_MS = 100;

// Joue la vidéo depuis le début jusqu'à sa fin (ou son échec, ou son blocage, ou `aborted` : l'émission s'arrête) : la page passe
// alors à la suite. `onTime` reçoit la position de lecture en ms, de quoi caler le tchat et les sursauts sur le clip.
export const playVideo = async (
  video: HTMLVideoElement,
  aborted: Promise<void>,
  onTime: (ms: number) => void,
): Promise<void> => {
  let stop: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    stop = resolve;
  });
  video.addEventListener("ended", stop);
  video.addEventListener("error", stop);
  video.currentTime = 0;
  if (await startVideo(video)) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, (video.duration || 0) * 1000 + STALL_LIMIT_MS);
    });
    const clock = setInterval(() => onTime(video.currentTime * 1000), TIME_STEP_MS);
    await Promise.race([ended, stalled, aborted]);
    clearInterval(clock);
    clearTimeout(timer);
  }
  video.removeEventListener("ended", stop);
  video.removeEventListener("error", stop);
  video.pause();
};
