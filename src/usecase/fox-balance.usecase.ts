import {
  BALANCE_START,
  type Balance,
  ENVELOPE_START,
  type Envelope,
  isBalanceDue,
  toBalanceRules,
  toEnvelopeLevel,
  toNextBalance,
  toNextEnvelope,
} from "../domain/balance.rules";
import { ADDRESS_MODE } from "../domain/fox-mode.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { MicPort } from "./head.usecase";

// Le son du PC d'OBS vu du usecase : un level en dB à chaque mesure, comme le mic ; infra l'implémente.
export type DesktopPort = { subscribe(listener: (level: number) => void): () => void };

export type FoxBalanceDeps = {
  mic: MicPort;
  desktop: DesktopPort;
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "getVoice" | "subscribe">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxBalance = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// La balance du son : pendant que Fenysk parle, le renard compare le pic de sa voix à celui du son du PC. Si le jeu est au
// moins aussi fort pendant assez de parole cumulée, il alerte Fenysk (tourné vers lui, sans que sa voix coupe la phrase). Il
// revient s'il était caché. Quand Fenysk se tait, un jeu fort est normal : rien ne se compare.
export function createFoxBalance({
  mic,
  desktop,
  queue,
  mode,
  settings: initial,
  clock,
  random,
  log,
}: FoxBalanceDeps): FoxBalance {
  let rules = toBalanceRules(initial);
  let alerts = initial.foxBalanceAlerts ?? [];
  let voice: Envelope = ENVELOPE_START;
  let game: Envelope = ENVELOPE_START;
  let balance: Balance = BALANCE_START;
  let lastAlertAt: number | null = null;
  let said: string[] = [];
  const unsubscribes: (() => void)[] = [];

  const onTick = () => {
    if (!rules) return;
    const now = clock();
    const { isTalking, silentFor } = mode.getVoice();
    balance = toNextBalance(
      balance,
      { now, isTalking, silentFor, voice: toEnvelopeLevel(voice, now), desktop: toEnvelopeLevel(game, now) },
      rules,
    );
    const sinceLast = lastAlertAt === null ? Number.POSITIVE_INFINITY : now - lastAlertAt;
    if (!isBalanceDue({ balance, sinceLast }, rules)) return;
    const pick = toNextPick(alerts, said, random);
    if (!pick) return;
    said = pick.said;
    lastAlertAt = now;
    balance = BALANCE_START;
    log(`Renard : le son du PC couvre la voix de Fenysk : « ${pick.phrase} »`);
    queue.push({
      kind: "balance",
      label: "alerte du son",
      text: pick.phrase,
      isCuttable: false,
      isUrgent: true,
      toShow: () => ADDRESS_MODE,
    });
  };

  return {
    start() {
      if (unsubscribes.length > 0) return;
      unsubscribes.push(
        mic.subscribe((level) => {
          voice = toNextEnvelope(voice, { now: clock(), level });
        }),
        desktop.subscribe((level) => {
          game = toNextEnvelope(game, { now: clock(), level });
        }),
        mode.subscribe(onTick),
      );
    },
    stop() {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    },
    update(next) {
      rules = toBalanceRules(next);
      alerts = next.foxBalanceAlerts ?? [];
    },
  };
}
