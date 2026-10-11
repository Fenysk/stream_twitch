import { toHeadView } from "../domain/head.rules";
import type { Head, HeadView, Mouth } from "../domain/head.types";
import { isLoud, type MouthRules, toNextMouth } from "../domain/mouth.rules";
import { toScale, toScaleCurve } from "../domain/scale.rules";
import type { Settings } from "../domain/settings.schema";

// Le dernier état de la tête et ceux qui le suivent (les pages ouvertes).
export type HeadFeed = {
  getView(): HeadView;
  publish(view: HeadView): void;
  subscribe(listener: (view: HeadView) => void): () => void;
};

export function createHeadFeed(initial: HeadView): HeadFeed {
  let current = initial;
  const listeners = new Set<(view: HeadView) => void>();
  return {
    getView: () => current,
    publish(view) {
      current = view;
      for (const listener of listeners) listener(view);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Le micro d'OBS vu du usecase : un level en dB à chaque mesure ; infra l'implémente.
export type MicPort = { subscribe(listener: (level: number) => void): () => void };

// Horloge et hasard sont injectés : la boucle se teste sans attendre ni tirer au sort.
export type HeadLoopDeps = {
  mic: MicPort;
  head: Head;
  settings: Settings;
  clock: () => number;
  random: () => number;
};

export type HeadLoop = { feed: HeadFeed; start(): void; stop(): void };

export function createHeadLoop({ mic, head, settings, clock, random }: HeadLoopDeps): HeadLoop {
  const opening = settings.opening ?? head.opening;
  const tilt = settings.tilt ?? opening;
  const curve = toScaleCurve(settings);
  const rhythm = settings.rhythm ?? head.rhythm;
  const rules: MouthRules = { poses: head.poses, closedChance: head.closedChance, delay: settings.delay };
  const feed = createHeadFeed(toHeadView(head, { tilt, opening, scale: 1 }, { kind: "closed" }));
  let mouth: Mouth = { kind: "closed" };
  let lastLoudAt: number | null = null;
  // Le level le plus fort depuis le pas précédent : un pic de voix entre deux pas ne doit pas se perdre.
  let peak = Number.NEGATIVE_INFINITY;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const step = () => {
    const scale = curve ? toScale(peak, curve) : 1;
    peak = Number.NEGATIVE_INFINITY;
    const next = toNextMouth({ previous: mouth, lastLoudAt, now: clock(), rules, random });
    if (next.kind === "closed" && mouth.kind === "closed") return;
    mouth = next;
    feed.publish(toHeadView(head, { tilt, opening, scale }, next));
  };

  // Chaque pas est visé à date fixe : sous Windows un minuteur arrive jusqu'à ~15 ms en retard, un `setInterval` en cumulerait.
  let nextAt = 0;
  const tick = () => {
    step();
    nextAt = Math.max(nextAt + rhythm, clock());
    timer = setTimeout(tick, nextAt - clock());
  };

  return {
    feed,
    start() {
      unsubscribe = mic.subscribe((level) => {
        peak = Math.max(peak, level);
        if (isLoud(level, settings.threshold)) lastLoudAt = clock();
      });
      nextAt = clock() + rhythm;
      timer = setTimeout(tick, rhythm);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
