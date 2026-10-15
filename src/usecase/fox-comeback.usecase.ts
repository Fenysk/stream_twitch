import {
  COMEBACK_START,
  type Comeback,
  toComebackRules,
  toNextComeback,
  toSpokenGone,
} from "../domain/comeback.rules";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import { toFilledPhrase } from "../domain/phrase.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";

export type FoxComebackDeps = {
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "getVoice" | "subscribe">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxComeback = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// Le retour : Fenysk muet depuis 5 min (mic coupé compris) après avoir été entendu une fois, puis qui reparle (1 s de voix sur
// 3 s : une toux ne compte pas). Le renard dit alors une phrase tirée dans les deux listes ensemble, sans répéter avant d'avoir
// tout dit ; elle est tournée vers Fenysk ou vers le tchat selon sa liste, attend son silence, et sa voix ne la coupe pas.
// Caché, il revient en sautant pour la dire. Une seule phrase par absence.
export function createFoxComeback({
  queue,
  mode,
  settings: initial,
  clock,
  random,
  log,
}: FoxComebackDeps): FoxComeback {
  let rules = toComebackRules(initial);
  let toFenysk = initial.foxComebackToFenysk ?? [];
  let toChat = initial.foxComebackToChat ?? [];
  let comeback: Comeback = COMEBACK_START;
  let said: string[] = [];
  let unsubscribe: (() => void) | undefined;

  const onTick = () => {
    if (!rules) return;
    const { isTalking, silentFor } = mode.getVoice();
    const step = toNextComeback(comeback, { now: clock(), isTalking, silentFor, after: rules.after });
    comeback = step.comeback;
    if (step.goneFor === null || !rules.shouldHail) return;
    const pick = toNextPick([...new Set([...toFenysk, ...toChat])], said, random);
    if (!pick) return;
    said = pick.said;
    const spoken = toSpokenGone(step.goneFor);
    const text = toFilledPhrase(pick.phrase, { absence: spoken });
    const isForFenysk = toFenysk.includes(pick.phrase);
    log(`Renard : Fenysk revient après ${spoken} d'absence, il le salue : « ${text} »`);
    queue.push({
      kind: "comeback",
      label: "phrase de retour",
      text,
      isCuttable: false,
      isUrgent: true,
      toShow: () => (isForFenysk ? ADDRESS_MODE : null),
    });
  };

  return {
    start() {
      unsubscribe ??= mode.subscribe(onTick);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
    update(next) {
      rules = toComebackRules(next);
      toFenysk = next.foxComebackToFenysk ?? [];
      toChat = next.foxComebackToChat ?? [];
    },
  };
}
