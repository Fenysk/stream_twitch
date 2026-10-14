import { hasWaitedTooLong, toWaitText } from "../domain/chat-filter.rules";
import { type Show, toFoxModeRules } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import type { Fox } from "./fox.usecase";
import type { FoxModeController, Intro } from "./fox-mode.usecase";

// Ce que le renard a à dire : un message du tchat, un remerciement, une pique, un rappel, une phrase de cri, de tunnel, de
// balance ou d'heure du live. `label` nomme l'entrée dans le journal (« message de Alice »). Un message garde de quoi la retirer quand la
// modération le supprime.
export type QueueItem = {
  kind: "message" | "thanks" | "jab" | "reminder" | "shout" | "tunnel" | "balance" | "hours";
  label: string;
  text: string;
  messageId?: string | undefined;
  viewerId?: string | undefined;
  // Alexis qui parle plus de `stopAfter` coupe la lecture, qui n'est jamais reprise (D). Un remerciement, une phrase de cri
  // de tunnel ou de balance ne sont pas coupés.
  isCuttable: boolean;
  // Passe devant les messages qui attendent (jamais devant celui qu'on lit).
  isUrgent: boolean;
  // Ce qu'il montre avant de parler, tiré au moment où la lecture commence.
  toShow: () => Show | null;
  // Appelé quand la phrase est finie (ou qu'elle n'a pas pu être dite), jamais quand elle est coupée ou retirée.
  onDone?: (() => void) | undefined;
};

export type FoxQueueDeps = {
  fox: Pick<Fox, "speak" | "stop">;
  // D, E, G, H : l'écoute d'Alexis, le retour, la réaction ou le coucou avant de lire.
  mode: Pick<FoxModeController, "getVoice" | "wake" | "noteSpoke" | "introduce" | "subscribe">;
  settings: Settings;
  // L'heure en ms : l'âge d'une entrée qui attend.
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type FoxQueue = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  // Il revient s'il était parti, puis dit l'entrée quand c'est son tour et qu'Alexis s'est tu.
  push(item: QueueItem): void;
  // Combien d'entrées (celle qu'on lit comprise) répondent à `isCounted`.
  count(isCounted: (item: QueueItem) => boolean): number;
  // Retire de la file, et arrête la lecture si elle en fait partie. Avec `cause`, chaque retrait s'écrit au journal.
  removeWhere(isRemoved: (item: QueueItem) => boolean, cause?: string): void;
};

// Le silence entre deux entrées lues : la page met un instant à charger le WAV, et le renard reprend son souffle.
const SILENCE_BETWEEN_MS = 400;

// Une entrée qui attend, avec l'heure de son arrivée dans la file.
type Queued = QueueItem & { queuedAt: number };

// L'entrée qu'on lit, de son entrée en scène à la fin de sa phrase. `isPlaying` : sa phrase est partie aux pages ; avant,
// elle n'est qu'en synthèse ou en attente de la réaction, et peut s'annuler.
type Reading = {
  item: QueueItem;
  intro: Intro;
  isCancelled: boolean;
  isPlaying: boolean;
  cancelEnd: (() => void) | undefined;
};

export function createFoxQueue({
  fox,
  mode,
  settings: initial,
  clock,
  schedule,
  log,
}: FoxQueueDeps): FoxQueue {
  let modeRules = toFoxModeRules(initial);
  let maxWait = initial.foxReadMaxWait;
  const waiting: Queued[] = [];
  let current: Reading | undefined;
  let unsubscribeTick: (() => void) | undefined;

  // D : on ne commence pas à lire tant qu'Alexis parle ; il doit se taire depuis `readSilence`.
  const isAlexisSilent = (): boolean => !modeRules || mode.getVoice().silentFor >= modeRules.readSilence;
  // D : on lit, et Alexis parle depuis plus de `stopAfter` sans s'arrêter.
  const isAlexisInterrupting = (): boolean => !!modeRules && mode.getVoice().talkingFor > modeRules.stopAfter;

  // Seul un message ordinaire du tchat expire : un remerciement, le message qui lui est joint (urgent) et une pique, jamais.
  const canExpire = ({ kind, isUrgent }: QueueItem): boolean => kind === "message" && !isUrgent;

  // Un message qui attend depuis plus de `maxWait` sort de la file, et le journal le dit.
  const deleteExpired = () => {
    const limit = maxWait;
    if (limit === undefined) return;
    const now = clock();
    const hasExpired = (item: Queued): boolean =>
      canExpire(item) && hasWaitedTooLong(item.queuedAt, now, limit);
    for (const item of waiting.filter(hasExpired)) {
      log(`Renard : ${item.label} expiré (attente de plus de ${toWaitText(limit)})`);
    }
    const kept = waiting.filter((item) => !hasExpired(item));
    waiting.splice(0, waiting.length, ...kept);
  };

  const startNext = () => {
    deleteExpired();
    if (current || !isAlexisSilent()) return;
    const item = waiting.shift();
    if (!item) return;
    const intro = mode.introduce(item.toShow());
    const reading: Reading = { item, intro, isCancelled: false, isPlaying: false, cancelEnd: undefined };
    current = reading;
    void fox
      .speak(item.text, { isCancelled: () => reading.isCancelled, waitFor: intro.ready })
      .then((result) => {
        // Arrêtée entre-temps : si sa phrase est quand même partie (supprimée juste après l'envoi), les pages l'arrêtent.
        if (current !== reading) {
          if (result.ok) fox.stop();
          return;
        }
        if (!result.ok) {
          log(`Renard : ${item.label} non lu : ${result.message}`);
          finish();
          return;
        }
        reading.isPlaying = true;
        reading.cancelEnd = schedule(finish, result.durationMs + SILENCE_BETWEEN_MS);
      });
  };

  function finish() {
    const item = current?.item;
    current?.intro.cancel();
    current = undefined;
    mode.noteSpoke();
    item?.onDone?.();
    startNext();
  }

  const stopCurrent = () => {
    const reading = current;
    if (!reading) return;
    current = undefined;
    reading.isCancelled = true;
    reading.cancelEnd?.();
    reading.intro.cancel();
    if (reading.isPlaying) {
      fox.stop();
      mode.noteSpoke();
    }
    startNext();
  };

  // Un pas de 100 ms : Alexis qui parle trop longtemps coupe la lecture (sauf d'un remerciement), qui n'est jamais reprise ;
  // un message trop vieux expire ; une entrée qui attend garde le renard là (sans cela, il bâillerait et partirait avec une
  // entrée dans la file), et part dès qu'Alexis se tait.
  const onTick = () => {
    if (current?.item.isCuttable && isAlexisInterrupting()) {
      log(`Renard : lecture abandonnée, Alexis parle (${current.item.label}).`);
      stopCurrent();
      return;
    }
    deleteExpired();
    if (waiting.length === 0) return;
    mode.wake();
    startNext();
  };

  const insert = (item: Queued) => {
    if (!item.isUrgent) {
      waiting.push(item);
      return;
    }
    const firstOrdinary = waiting.findIndex((other) => !other.isUrgent);
    waiting.splice(firstOrdinary < 0 ? waiting.length : firstOrdinary, 0, item);
  };

  return {
    start() {
      unsubscribeTick ??= mode.subscribe(onTick);
    },
    stop() {
      unsubscribeTick?.();
      unsubscribeTick = undefined;
      waiting.length = 0;
      stopCurrent();
    },
    update(next) {
      modeRules = toFoxModeRules(next);
      maxWait = next.foxReadMaxWait;
    },
    push(item) {
      insert({ ...item, queuedAt: clock() });
      mode.wake();
      startNext();
    },
    count: (isCounted) => waiting.filter(isCounted).length + (current && isCounted(current.item) ? 1 : 0),
    removeWhere(isRemoved, cause) {
      if (cause !== undefined) {
        for (const item of waiting.filter(isRemoved)) {
          log(`Renard : ${item.label} retiré de la file (${cause}).`);
        }
      }
      const kept = waiting.filter((item) => !isRemoved(item));
      waiting.splice(0, waiting.length, ...kept);
      if (current && isRemoved(current.item)) {
        if (cause !== undefined) log(`Renard : lecture arrêtée, ${current.item.label} retiré (${cause}).`);
        stopCurrent();
      }
    },
  };
}
