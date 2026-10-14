import { STARTLE_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { isSpike, type Sample, toRecentSamples, toStartleRules } from "../domain/startle.rules";
import type { Fox } from "./fox.usecase";
import type { DesktopPort } from "./fox-balance.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";

export type FoxStartleDeps = {
  desktop: DesktopPort;
  queue: Pick<FoxQueue, "count">;
  mode: Pick<FoxModeController, "flash">;
  fox: Pick<Fox, "getPresence">;
  settings: Settings;
  clock: () => number;
  log: (message: string) => void;
};

export type FoxStartle = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// Le sursaut du jeu : quand le son du PC a un spike (une hausse soudaine, jusqu'à un level fort), le renard visible prend la
// tête choquée le temps d'une réaction, tourné vers le tchat, sans rien dire. Seulement s'il ne parle pas (la file est vide) ;
// au plus un par écart. Le spike se mesure sur les mesures brutes du desktop : un lissage aplatirait la hausse.
export function createFoxStartle({
  desktop,
  queue,
  mode,
  fox,
  settings: initial,
  clock,
  log,
}: FoxStartleDeps): FoxStartle {
  let rules = toStartleRules(initial);
  let samples: Sample[] = [];
  let lastAt: number | null = null;
  let unsubscribe: (() => void) | undefined;

  const hear = (level: number) => {
    if (!rules) return;
    const now = clock();
    const recent = toRecentSamples(samples, now, rules.within);
    samples = [...recent, { at: now, level }];
    if (!isSpike(recent, level, rules)) return;
    if (lastAt !== null && now - lastAt < rules.gap) return;
    if (fox.getPresence().kind !== "visible" || queue.count(() => true) > 0) return;
    if (mode.flash(STARTLE_MODE) === 0) return;
    lastAt = now;
    log("Renard : le son du jeu explose, il sursaute.");
  };

  return {
    start() {
      unsubscribe ??= desktop.subscribe(hear);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
    update(next) {
      rules = toStartleRules(next);
    },
  };
}
