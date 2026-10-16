import { ADDRESS_MODE, type Show } from "../domain/fox-mode.rules";
import { isJabDue, type SilenceKind, toJabRules, toNextSilenceKind } from "../domain/jab.rules";
import { toFilledPhrase } from "../domain/phrase.rules";
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
  // La récompense « Clasher Fenysk » de `user` (déjà vérifié par le filtre d'insultes) : tout de suite, une intro puis une pique.
  clash(user: string): void;
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
// Ni l'une ni l'autre avant la première parole de Fenysk depuis le démarrage.
// Un clash (la récompense d'un viewer) pique tout de suite, hors de ce rythme : il n'attend pas l'écart et n'y compte pas, mais il
// pioche dans les mêmes piques, sans répéter.
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
  let intros = initial.foxClashIntros ?? [];
  let lastActivityAt = clock();
  let lastAt: number | null = null;
  let lastKind: SilenceKind | null = null;
  const said: Record<SilenceKind, string[]> = { jab: [], reminder: [] };
  let saidIntros: string[] = [];
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
      intros = next.foxClashIntros ?? [];
    },
    noteActivity() {
      lastActivityAt = clock();
    },
    clash(user) {
      if (!rules) return;
      const jab = toNextPick(jabs, said.jab, random);
      const intro = toNextPick(intros, saidIntros, random);
      if (!jab || !intro) {
        log(`Renard : récompense, aucune ${jab ? "phrase d'intro" : "pique à dire"}, rien n'est dit.`);
        return;
      }
      said.jab = jab.said;
      saidIntros = intro.said;
      const text = `${toFilledPhrase(intro.phrase, { user })} ${jab.phrase}`;
      lastActivityAt = clock();
      log(`Renard : récompense, il pique Fenysk tout de suite : « ${text} »`);
      queue.push({
        kind: "jab",
        label: "pique (récompense)",
        text,
        isCuttable: true,
        isUrgent: true,
        toShow: () => ADDRESS_MODE,
      });
    },
  };
}
