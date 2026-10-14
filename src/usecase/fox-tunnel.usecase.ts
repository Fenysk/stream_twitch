import { ADDRESS_MODE, YAWN_MODE } from "../domain/fox-mode.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import { isTunnelDue, TUNNEL_START, type Tunnel, toNextTunnel, toTunnelRules } from "../domain/tunnel.rules";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";

export type FoxTunnelDeps = {
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "getVoice" | "subscribe" | "wake" | "flash">;
  settings: Settings;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  random: () => number;
  log: (message: string) => void;
};

export type FoxTunnel = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// Le tunnel : quand Fenysk parle depuis 3 min sans silence de plus de 5 s, le renard visible bâille (sans partir) puis dit une
// phrase tirée dans les deux listes ensemble, sans répéter avant d'avoir tout dit ; elle est tournée vers Fenysk ou vers le
// tchat selon sa liste, et sa voix ne la coupe pas. Caché, il revient en sautant pour la dire, sans bâiller. Après un tunnel,
// les 3 min repartent de zéro.
export function createFoxTunnel({
  queue,
  mode,
  settings: initial,
  clock,
  schedule,
  random,
  log,
}: FoxTunnelDeps): FoxTunnel {
  let rules = toTunnelRules(initial);
  let toFenysk = initial.foxTunnelToFenysk ?? [];
  let toChat = initial.foxTunnelToChat ?? [];
  let tunnel: Tunnel = TUNNEL_START;
  let lastAt: number | null = null;
  let said: string[] = [];
  let unsubscribe: (() => void) | undefined;
  let cancelSay: (() => void) | undefined;

  const say = (text: string, isForFenysk: boolean) => {
    cancelSay = undefined;
    queue.push({
      kind: "tunnel",
      label: "phrase de tunnel",
      text,
      isCuttable: false,
      isUrgent: true,
      toShow: () => (isForFenysk ? ADDRESS_MODE : null),
    });
  };

  const onTick = () => {
    if (!rules) return;
    const now = clock();
    tunnel = toNextTunnel(tunnel, { now, silentFor: mode.getVoice().silentFor, pause: rules.pause });
    const sinceLast = lastAt === null ? Number.POSITIVE_INFINITY : now - lastAt;
    if (!isTunnelDue({ tunnel, now, sinceLast }, rules)) return;
    const pick = toNextPick([...new Set([...toFenysk, ...toChat])], said, random);
    if (!pick) return;
    said = pick.said;
    lastAt = now;
    tunnel = { since: now };
    const isForFenysk = toFenysk.includes(pick.phrase);
    log(`Renard : Fenysk parle sans s'arrêter, il le fait remarquer : « ${pick.phrase} »`);
    // Il reste là (son délai avant de partir repart) ou revient s'il était parti ; il ne bâille que s'il est visible.
    mode.wake();
    const yawnMs = mode.flash(YAWN_MODE);
    if (yawnMs > 0) cancelSay = schedule(() => say(pick.phrase, isForFenysk), yawnMs);
    else say(pick.phrase, isForFenysk);
  };

  return {
    start() {
      unsubscribe ??= mode.subscribe(onTick);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      cancelSay?.();
      cancelSay = undefined;
    },
    update(next) {
      rules = toTunnelRules(next);
      toFenysk = next.foxTunnelToFenysk ?? [];
      toChat = next.foxTunnelToChat ?? [];
    },
  };
}
