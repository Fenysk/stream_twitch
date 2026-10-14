import {
  type AttitudeRules,
  isResumeDue,
  toAttitude,
  toAttitudeRules,
  toRecentTimes,
} from "../domain/attitude.rules";
import type { Attitude } from "../domain/fox.schema";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import type { Fox } from "./fox.usecase";
import type { FoxModeController } from "./fox-mode.usecase";

export type FoxAttitudeDeps = {
  mode: Pick<FoxModeController, "subscribe">;
  fox: Pick<Fox, "getPresence" | "updateAttitude">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxAttitude = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  // Un message d'un viewer vient d'arriver (ni le compte de la chaîne ni un bot) : `isAccepted` quand il passe le filtre. Le
  // tchat a parlé. Un message accepté qui rompt un long silence rend la phrase de la reprise à dire avant lui, sinon `null`.
  noteMessage(message: { isAccepted: boolean }): string | null;
};

const SWITCH_LOGS: Record<Attitude, string> = {
  plain: "Renard : il retrouve son humeur ordinaire.",
  cheerful: "Renard : le tchat s'anime, il est joyeux.",
  sulking: "Renard : le tchat se tait, il boude.",
};

// L'humeur du renard suit le tchat : joyeux quand `foxCheerfulCount` messages acceptés tombent dans `foxCheerfulPeriod`, boudeur
// quand il est visible et que le tchat se tait depuis `foxSulkAfter`, ordinaire sinon (le silence l'emporte). Elle part aux pages,
// qui en tirent ses regards au repos, et ne change rien d'autre. La reprise : le premier message accepté après `foxResumeAfter`
// de silence du tchat reçoit une phrase tournée vers le tchat, au plus une toutes les 30 min, tirée sans répéter. Le silence se
// compte depuis le dernier message d'un viewer, accepté ou non, ou depuis le démarrage du serveur.
export function createFoxAttitude({
  mode,
  fox,
  settings: initial,
  clock,
  random,
  log,
}: FoxAttitudeDeps): FoxAttitude {
  let rules: AttitudeRules | undefined = toAttitudeRules(initial);
  let accepted: number[] = [];
  let lastChatAt = clock();
  let lastResumeAt: number | null = null;
  let current: Attitude = "plain";
  let said: string[] = [];
  let unsubscribe: (() => void) | undefined;

  const refresh = () => {
    if (!rules) return;
    const now = clock();
    accepted = toRecentTimes(accepted, now, rules.cheerfulPeriod);
    const next = toAttitude(
      { now, isVisible: fox.getPresence().kind === "visible", lastChatAt, recent: accepted },
      rules,
    );
    if (next === current) return;
    current = next;
    fox.updateAttitude(next);
    log(SWITCH_LOGS[next]);
  };

  const pickResume = (now: number): string | null => {
    const pick = toNextPick(rules?.resumePhrases ?? [], said, random);
    if (!pick) return null;
    said = pick.said;
    lastResumeAt = now;
    log(`Renard : le tchat reprend la parole : « ${pick.phrase} »`);
    return pick.phrase;
  };

  return {
    start() {
      unsubscribe ??= mode.subscribe(refresh);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
    update(next) {
      rules = toAttitudeRules(next);
    },
    noteMessage({ isAccepted }) {
      if (!rules) return null;
      const now = clock();
      const resume =
        isAccepted && isResumeDue({ now, lastChatAt, lastResumeAt }, rules) ? pickResume(now) : null;
      lastChatAt = now;
      if (isAccepted) accepted.push(now);
      refresh();
      return resume;
    },
  };
}
