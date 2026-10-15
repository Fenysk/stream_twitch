// Twitch ne retient pas la fermeture d'OBS : au-delà de 5 s, le serveur s'arrête sans attendre la pause des rewards.
export const PAUSE_WAIT_MS = 5000;

export type ShutdownDeps = {
  // Met les rewards en pause (les viewers ne peuvent plus dépenser leurs points hors stream).
  pauseRewards: () => Promise<void>;
  exit: () => void;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

// L'arrêt du serveur (OBS se ferme, OBS ne revient pas, signal d'arrêt) : les rewards se mettent en pause, puis le serveur
// quitte. Une seule fois, quel que soit le nombre de causes qui arrivent.
export function createShutdown({
  pauseRewards,
  exit,
  schedule,
  log,
}: ShutdownDeps): (reason: string) => Promise<void> {
  let isStarted = false;
  return async (reason) => {
    if (isStarted) return;
    isStarted = true;
    log(reason);
    await new Promise<void>((resolve) => {
      const cancel = schedule(resolve, PAUSE_WAIT_MS);
      pauseRewards()
        .catch((error: unknown) =>
          log(`Arrêt : rewards pas mis en pause (${error instanceof Error ? error.message : error}).`),
        )
        .finally(() => {
          cancel();
          resolve();
        });
    });
    exit();
  };
}
