import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import { isJabDue, toJabRules } from "../domain/jab.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import type { Chat } from "./chat.usecase";
import type { Fox } from "./fox.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";

export type FoxJabDeps = {
  chat: Pick<Chat, "subscribeSource">;
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "getVoice" | "subscribe">;
  fox: Pick<Fox, "getPresence">;
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

// La relance : le renard caché, quand Fenysk et le tchat se taisent depuis assez longtemps, revient en sautant, se tourne vers
// Fenysk et lui dit une pique tirée de la liste, sans répéter avant d'avoir tout dit. La pique passe par la file : si Fenysk
// parle plus d'1 s, elle s'arrête.
export function createFoxJab({
  chat,
  queue,
  mode,
  fox,
  settings: initial,
  clock,
  random,
  log,
}: FoxJabDeps): FoxJab {
  let rules = toJabRules(initial);
  let jabs = initial.foxJabs ?? [];
  let lastActivityAt = clock();
  let lastJabAt: number | null = null;
  let said: string[] = [];
  let unsubscribeChat: (() => void) | undefined;
  let unsubscribeTick: (() => void) | undefined;

  const jab = () => {
    if (!rules || jabs.length === 0) return;
    const now = clock();
    const presence = fox.getPresence();
    const isDue = isJabDue(
      {
        awayFor: presence.kind === "away" ? presence.elapsed : null,
        voiceSilentFor: mode.getVoice().silentFor,
        chatSilentFor: now - lastActivityAt,
        sinceLastJab: lastJabAt === null ? Number.POSITIVE_INFINITY : now - lastJabAt,
      },
      rules,
    );
    if (!isDue) return;
    const pick = toNextPick(jabs, said, random);
    if (!pick) return;
    said = pick.said;
    lastJabAt = now;
    log(`Renard : il revient piquer Fenysk : « ${pick.phrase} »`);
    queue.push({
      kind: "jab",
      label: "pique",
      text: pick.phrase,
      isCuttable: true,
      isUrgent: false,
      toShow: () => ADDRESS_MODE,
    });
  };

  return {
    start() {
      unsubscribeChat ??= chat.subscribeSource((event) => {
        if (event.kind === "message") lastActivityAt = clock();
      });
      unsubscribeTick ??= mode.subscribe(jab);
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
    },
    noteActivity() {
      lastActivityAt = clock();
    },
  };
}
