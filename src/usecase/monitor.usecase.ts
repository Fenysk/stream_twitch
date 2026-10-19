// Une image de la scène du programme (JPEG), ou pourquoi OBS ne la donne pas.
export type MonitorShot = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

// OBS vu du retour antenne ; infra l'implémente avec GetSourceScreenshot. Un refus (OBS non joint, scène inconnue) est un résultat.
export type MonitorPort = { getImage(scene: string): Promise<MonitorShot> };

export type MonitorDeps = {
  port: MonitorPort;
  // La scène du programme à l'instant ; `null` : OBS non joint ou sans scène.
  getScene: () => string | null;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
};

// `getImage` : la capture en cours est partagée, et un résultat de moins de 200 ms sert à tous (réussi ou refusé) : OBS capture au plus
// ~4 fois par seconde, quel que soit le nombre de téléphones.
export type Monitor = { getImage(): Promise<MonitorShot> };

const REUSE_MS = 200;
// obs-websocket-js ne rejette pas un appel resté sans réponse quand OBS se coupe : sans limite, la capture partagée resterait en vol.
const CAPTURE_LIMIT_MS = 3000;

const toReason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createMonitor({ port, getScene, clock, schedule }: MonitorDeps): Monitor {
  let inFlight: Promise<MonitorShot> | null = null;
  let last: { shot: MonitorShot; at: number } | null = null;

  const ask = async (scene: string): Promise<MonitorShot> => {
    try {
      return await port.getImage(scene);
    } catch (error) {
      return { ok: false, reason: toReason(error) };
    }
  };

  // La première des deux réponses compte : celle d'OBS, ou le refus des 3 s (la réponse tardive d'OBS est perdue).
  const capture = (scene: string): Promise<MonitorShot> =>
    new Promise((resolve) => {
      const cancel = schedule(
        () => resolve({ ok: false, reason: "OBS ne rend pas l'image à temps" }),
        CAPTURE_LIMIT_MS,
      );
      void ask(scene).then((shot) => {
        cancel();
        resolve(shot);
      });
    });

  return {
    getImage() {
      const scene = getScene();
      if (scene === null)
        return Promise.resolve<MonitorShot>({
          ok: false,
          reason: "OBS ne dit pas quelle scène est à l'antenne",
        });
      if (inFlight) return inFlight;
      if (last && clock() - last.at < REUSE_MS) return Promise.resolve(last.shot);
      inFlight = capture(scene)
        .then((shot) => {
          last = { shot, at: clock() };
          return shot;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}
