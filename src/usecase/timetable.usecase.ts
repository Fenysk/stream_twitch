import { type Slot, toNextSlot, toSlotText } from "../domain/timetable.rules";

// Les slots à venir de la timetable Twitch d'Alexis, vus du usecase : `get` rend [] quand la chaîne n'a pas de timetable, et
// lève quand Twitch ne répond pas, ou pas comme il faut. Les créneaux annulés n'y sont pas.
export type TimetablePort = { get(): Promise<readonly Slot[]> };

export type TimetableDeps = {
  port: TimetablePort;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  clock: () => number;
  log: (message: string) => void;
};

export type Timetable = {
  // Demande tout de suite, puis toutes les 30 min. Finit à la première réponse.
  start(): Promise<void>;
  stop(): void;
  // Le prochain slot, ou `null` quand on n'en connaît pas : pas de timetable, pas de créneau à venir, pas de réponse.
  getNext(): Slot | null;
};

export const TIMETABLE_PERIOD_MS = 30 * 60_000;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createTimetable({ port, schedule, clock, log }: TimetableDeps): Timetable {
  let slots: readonly Slot[] = [];
  let shownStart: number | null | undefined;
  let isFailing = false;
  let isStopped = false;
  let cancelNext: (() => void) | undefined;

  const getNext = (): Slot | null => toNextSlot(slots, clock());

  // Le journal dit le prochain live quand il change (ou à la première réponse), pas toutes les 30 min.
  const logNext = () => {
    const next = getNext();
    const start = next ? next.start : null;
    if (start === shownStart) return;
    shownStart = start;
    log(`Planning : ${next ? toSlotText(next, clock()) : "aucun live à venir."}`);
  };

  const refresh = async () => {
    try {
      slots = await port.get();
      isFailing = false;
      logNext();
    } catch (error) {
      slots = [];
      shownStart = null;
      if (!isFailing) log(`Planning : inconnu, ${toMessage(error)}`);
      isFailing = true;
    }
  };

  const loop = async (): Promise<void> => {
    await refresh();
    if (!isStopped) cancelNext = schedule(() => void loop(), TIMETABLE_PERIOD_MS);
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
    getNext,
  };
}
