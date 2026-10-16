import { type EndMoment, HOUR_MS, isEndOver, OVERTIME_SPAN_MS, toClockText } from "../domain/hours.rules";
import type { Broadcast, BroadcastPort } from "./fox-hours.usecase";

// La fin prévue enregistrée : son instant (`null` : pas de fin), et de quoi l'effacer par un changement de réglage ; `reset` rend faux si l'écriture échoue.
export type EndPort = { get(): number | null; reset(): boolean };

export type FoxEndResetDeps = {
  broadcast: BroadcastPort;
  end: EndPort;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type FoxEndReset = { start(): void; stop(): void };

export const END_RESET_PERIOD_MS = 60_000;

const REASONS: Record<EndMoment["kind"], string> = {
  stopped: "est passée et le live est fini",
  idle: `est passée depuis plus de ${OVERTIME_SPAN_MS / HOUR_MS} h, hors live`,
  live: "est passée avant le début du live",
};

// La fin prévue ne vaut que pour le live qui la suit : effacée à l'arrêt du live si elle est passée, 3 h après elle hors live (relue
// chaque minute), et au début d'un live commencé après elle (OBS fermé en plein live : le serveur ne voit pas l'arrêt). Jamais
// pendant un live commencé avant elle, ni avant qu'OBS ait dit si le live est en cours : un serveur relancé en plein live la garde.
export function createFoxEndReset({ broadcast, end, clock, schedule, log }: FoxEndResetDeps): FoxEndReset {
  // Quand la diffusion a commencé, `null` hors diffusion, `undefined` tant qu'OBS n'a rien dit.
  let startedAt: number | null | undefined;
  let unsubscribe: (() => void) | undefined;
  let cancelNext: (() => void) | undefined;

  const resetIfOver = (moment: EndMoment) => {
    const endAt = end.get();
    if (endAt === null || !isEndOver(endAt, clock(), moment)) return;
    const clockText = toClockText(endAt);
    if (end.reset())
      log(`Renard : la fin prévue de ${clockText} ${REASONS[moment.kind]} : elle est effacée.`);
    else
      log(
        `Renard : la fin prévue de ${clockText} ${REASONS[moment.kind]}, mais elle n'a pas pu être effacée.`,
      );
  };

  const onBroadcast = ({ isLive, duration }: Broadcast) => {
    if (isLive) {
      startedAt = clock() - duration;
      resetIfOver({ kind: "live", startedAt });
      return;
    }
    const wasLive = typeof startedAt === "number";
    startedAt = null;
    resetIfOver({ kind: wasLive ? "stopped" : "idle" });
  };

  const onTime = () => {
    if (startedAt !== undefined)
      resetIfOver(startedAt === null ? { kind: "idle" } : { kind: "live", startedAt });
    cancelNext = schedule(onTime, END_RESET_PERIOD_MS);
  };

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = broadcast.subscribe(onBroadcast);
      cancelNext = schedule(onTime, END_RESET_PERIOD_MS);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      cancelNext?.();
      cancelNext = undefined;
    },
  };
}
