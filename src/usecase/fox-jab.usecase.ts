import { ADDRESS_MODE, type Show } from "../domain/fox-mode.rules";
import { isJabDue, type SilenceKind, toJabRules, toNextSilenceKind } from "../domain/jab.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import { toSlotText } from "../domain/timetable.rules";
import type { Chat } from "./chat.usecase";
import type { Fox } from "./fox.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { Timetable } from "./timetable.usecase";

export type FoxJabDeps = {
  chat: Pick<Chat, "subscribeSource">;
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "getVoice" | "subscribe">;
  fox: Pick<Fox, "getPresence">;
  // Le prochain live d'Alexis : il entre dans le tirage des rappels.
  timetable: Pick<Timetable, "getNext">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxJab = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  // Quelque chose s'est dit ou passé dans le live (un remerciement, par exemple) : le silence repart.
  noteActivity(): void;
};

// Ce qui change entre une pique et un rappel : son nom, sa ligne de journal, vers qui il est tourné.
const SILENCE: Readonly<Record<SilenceKind, { label: string; log: string; toShow: () => Show | null }>> = {
  jab: { label: "pique", log: "il revient piquer Fenysk", toShow: () => ADDRESS_MODE },
  reminder: { label: "rappel", log: "il revient faire un rappel au tchat", toShow: () => null },
};

// La relance : le renard caché, quand Fenysk et le tchat se taisent depuis assez longtemps, revient en sautant et dit une
// pique tournée vers Fenysk, puis, la fois suivante, un rappel tourné vers le tchat (une phrase de `foxReminders`, ou le prochain
// live d'Alexis), et ainsi de suite. Chaque liste se tire sans répéter avant d'avoir tout dit. La phrase passe par la file : si
// Fenysk parle plus d'1 s, elle s'arrête. Au plus une par écart, qu'elle soit pique ou rappel ; sans aucun rappel, la pique reste seule.
export function createFoxJab({
  chat,
  queue,
  mode,
  fox,
  timetable,
  settings: initial,
  clock,
  random,
  log,
}: FoxJabDeps): FoxJab {
  let rules = toJabRules(initial);
  let jabs = initial.foxJabs ?? [];
  let reminders = initial.foxReminders ?? [];
  let lastActivityAt = clock();
  let lastAt: number | null = null;
  let lastKind: SilenceKind | null = null;
  const said: Record<SilenceKind, string[]> = { jab: [], reminder: [] };
  let unsubscribeChat: (() => void) | undefined;
  let unsubscribeTick: (() => void) | undefined;

  // Les rappels qu'il peut tirer : ceux de la liste, et le prochain live d'Alexis quand on le connaît.
  const toReminders = (now: number): string[] => {
    const slot = timetable.getNext();
    return slot ? [...reminders, toSlotText(slot, now)] : reminders;
  };

  const speak = () => {
    if (!rules) return;
    const now = clock();
    const presence = fox.getPresence();
    const isDue = isJabDue(
      {
        awayFor: presence.kind === "away" ? presence.elapsed : null,
        voiceSilentFor: mode.getVoice().silentFor,
        chatSilentFor: now - lastActivityAt,
        sinceLastJab: lastAt === null ? Number.POSITIVE_INFINITY : now - lastAt,
      },
      rules,
    );
    if (!isDue) return;
    const phrases: Record<SilenceKind, string[]> = { jab: jabs, reminder: toReminders(now) };
    const kind = toNextSilenceKind(lastKind, {
      hasJab: phrases.jab.length > 0,
      hasReminder: phrases.reminder.length > 0,
    });
    if (kind === null) return;
    const pick = toNextPick(phrases[kind], said[kind], random);
    if (!pick) return;
    said[kind] = pick.said;
    lastAt = now;
    lastKind = kind;
    const { label, log: line, toShow } = SILENCE[kind];
    log(`Renard : ${line} : « ${pick.phrase} »`);
    queue.push({ kind, label, text: pick.phrase, isCuttable: true, isUrgent: false, toShow });
  };

  return {
    start() {
      unsubscribeChat ??= chat.subscribeSource((event) => {
        if (event.kind === "message") lastActivityAt = clock();
      });
      unsubscribeTick ??= mode.subscribe(speak);
    },
    stop() {
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      unsubscribeTick?.();
      unsubscribeTick = undefined;
    },
    update(next) {
      rules = toJabRules(next);
      jabs = next.foxJabs ?? [];
      reminders = next.foxReminders ?? [];
    },
    noteActivity() {
      lastActivityAt = clock();
    },
  };
}
