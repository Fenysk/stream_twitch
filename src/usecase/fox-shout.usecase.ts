import { ADDRESS_MODE, FLINCH_MODE } from "../domain/fox-mode.rules";
import { isLoud } from "../domain/mouth.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import {
  isShoutContinued,
  isShoutPainful,
  type Shout,
  toRecentStarts,
  toShoutRules,
} from "../domain/shout.rules";
import type { Fox } from "./fox.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { MicPort } from "./head.usecase";

export type FoxShoutDeps = {
  mic: MicPort;
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "flash">;
  fox: Pick<Fox, "getPresence">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxShout = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// Le cri : quand Fenysk crie, le renard visible sursaute (tourné vers lui, la tête choquée) sans rien dire. Il ne parle que
// si c'est pénible : plusieurs cris rapprochés, ou un cri qui dure ; la phrase est tirée sans répéter avant d'avoir tout dit,
// tournée vers Fenysk, et sa voix ne la coupe pas. Caché, un cri ne le fait pas revenir et ne compte pas.
export function createFoxShout({
  mic,
  queue,
  mode,
  fox,
  settings: initial,
  clock,
  random,
  log,
}: FoxShoutDeps): FoxShout {
  let rules = toShoutRules(initial);
  let phrases = initial.foxShouts ?? [];
  let shout: Shout | null = null;
  // Les débuts des cris comptés, de quoi savoir s'il y en a assez dans la période.
  let starts: number[] = [];
  let lastPhraseAt: number | null = null;
  let said: string[] = [];
  let unsubscribe: (() => void) | undefined;

  const say = (now: number) => {
    if (!rules || (lastPhraseAt !== null && now - lastPhraseAt < rules.gap)) return;
    const pick = toNextPick(phrases, said, random);
    if (!pick) return;
    said = pick.said;
    lastPhraseAt = now;
    log(`Renard : Fenysk crie, il proteste : « ${pick.phrase} »`);
    queue.push({
      kind: "shout",
      label: "phrase de cri",
      text: pick.phrase,
      isCuttable: false,
      isUrgent: true,
      toShow: () => ADDRESS_MODE,
    });
  };

  const hear = (level: number) => {
    if (!rules || !isLoud(level, rules.threshold)) return;
    const now = clock();
    if (isShoutContinued(shout, now, rules.merge)) {
      shout = { ...shout, lastLoudAt: now };
    } else {
      const isCounted = fox.getPresence().kind === "visible";
      shout = { startedAt: now, lastLoudAt: now, isCounted };
      if (isCounted) {
        starts = [...toRecentStarts(starts, now, rules.period), now];
        mode.flash(FLINCH_MODE);
      }
    }
    if (shout.isCounted && isShoutPainful(toRecentStarts(starts, now, rules.period).length, shout, rules))
      say(now);
  };

  return {
    start() {
      unsubscribe ??= mic.subscribe(hear);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
    update(next) {
      rules = toShoutRules(next);
      phrases = next.foxShouts ?? [];
    },
  };
}
