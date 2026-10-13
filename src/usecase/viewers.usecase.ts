// Le nombre de viewers du live en ce moment, vu du usecase : `null` quand le live est hors ligne. `get` lève quand Twitch ne
// répond pas, ou pas comme il faut.
export type ViewersPort = { get(): Promise<number | null> };

export type ViewersDeps = {
  port: ViewersPort;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type Viewers = {
  // Demande tout de suite, puis toutes les 60 s. Finit à la première réponse.
  start(): Promise<void>;
  stop(): void;
  // Le nombre de viewers, ou `null` quand on ne le sait pas : hors ligne, pas de réponse, pas d'identifiants, ou zéro. Les
  // phrases qui écrivent `{viewers}` ne se disent alors pas.
  getCount(): number | null;
};

export const VIEWERS_PERIOD_MS = 60_000;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Zéro et « hors ligne » sont la même chose pour le renard : il ne dit jamais « On est 0 ».
const toCount = (viewers: number | null): number | null => (viewers !== null && viewers > 0 ? viewers : null);

// Ce que le journal dit d'un changement : le nombre devient connu ou inconnu. `isNews` : c'est la première réponse, ou
// Twitch répond de nouveau après une panne ; elle s'écrit toujours (de quoi voir que la demande marche).
const toChangeLine = (previous: number | null, next: number | null, isNews: boolean): string | null => {
  if (!isNews && (previous === null) === (next === null)) return null;
  return next === null ? "Viewers : live hors ligne, nombre inconnu." : `Viewers : ${next} en ce moment.`;
};

export function createViewers({ port, schedule, log }: ViewersDeps): Viewers {
  let count: number | null = null;
  let isFailing = false;
  let hasAnswered = false;
  let isStopped = false;
  let cancelNext: (() => void) | undefined;

  // Le journal dit ce qui change (le nombre devient connu, ou inconnu), pas chaque minute.
  const refresh = async () => {
    try {
      const next = toCount(await port.get());
      const line = toChangeLine(count, next, isFailing || !hasAnswered);
      if (line) log(line);
      count = next;
      isFailing = false;
      hasAnswered = true;
    } catch (error) {
      count = null;
      if (!isFailing) log(`Viewers : nombre inconnu, ${toMessage(error)}`);
      isFailing = true;
    }
  };

  const loop = async (): Promise<void> => {
    await refresh();
    if (!isStopped) cancelNext = schedule(() => void loop(), VIEWERS_PERIOD_MS);
  };

  return {
    start() {
      isStopped = false;
      return loop();
    },
    stop() {
      isStopped = true;
      cancelNext?.();
      cancelNext = undefined;
    },
    getCount: () => count,
  };
}
