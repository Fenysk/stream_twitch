import { toHeadView } from "../domain/head.rules";
import type { Head, HeadView, Mouth } from "../domain/head.types";
import {
  IDLE_START,
  type IdleRules,
  type IdleState,
  isSameIdlePose,
  toIdleRules,
  toNextIdle,
} from "../domain/idle.rules";
import { isLoud, isTalking, type MouthRules, toNextMouth } from "../domain/mouth.rules";
import { type ScaleCurve, toScale, toScaleCurve } from "../domain/scale.rules";
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

// `update` : de nouveaux réglages, appliqués aussitôt (l'interface les change en direct, sans relancer le serveur).
export type HeadLoop = { feed: HeadFeed; start(): void; stop(): void; update(settings: Settings): void };

// Ce que les réglages décident, calculé une fois par jeu de réglages plutôt qu'à chaque pas.
type LoopPlan = {
  settings: Settings;
  tilt: number;
  opening: number;
  rhythm: number;
  rules: MouthRules;
  curve: ScaleCurve | undefined;
  idleRules: IdleRules | undefined;
};

const toLoopPlan = (head: Head, settings: Settings): LoopPlan => {
  const opening = settings.opening ?? head.opening;
  return {
    settings,
    tilt: settings.tilt ?? opening,
    opening,
    rhythm: settings.rhythm ?? head.rhythm,
    rules: { poses: head.poses, closedChance: head.closedChance, delay: settings.delay },
    curve: toScaleCurve(settings),
    idleRules: toIdleRules(settings),
  };
};

export function createHeadLoop({ mic, head, settings, clock, random }: HeadLoopDeps): HeadLoop {
  let plan = toLoopPlan(head, settings);
  const feed = createHeadFeed(
    toHeadView(
      head,
      { tilt: plan.tilt, opening: plan.opening, scale: 1 },
      { kind: "closed" },
      IDLE_START.pose,
    ),
  );
  let mouth: Mouth = { kind: "closed" };
  let idle: IdleState = IDLE_START;
  let scale = 1;
  let lastLoudAt: number | null = null;
  // Le level le plus fort depuis le pas précédent : un pic de voix entre deux pas ne doit pas se perdre.
  let peak = Number.NEGATIVE_INFINITY;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = (next: Mouth) =>
    feed.publish(toHeadView(head, { tilt: plan.tilt, opening: plan.opening, scale }, next, idle.pose));

  const step = () => {
    scale = plan.curve ? toScale(peak, plan.curve) : 1;
    peak = Number.NEGATIVE_INFINITY;
    const now = clock();
    const next = toNextMouth({ previous: mouth, lastLoudAt, now, rules: plan.rules, random });
    // Au repos (elle ne parle pas), la tête entière change de pose de repos ; dès qu'elle parle, elle redevient neutre.
    const nextIdle = plan.idleRules
      ? toNextIdle({
          previous: idle,
          isIdle: !isTalking(lastLoudAt, now, plan.settings.delay),
          now,
          rules: plan.idleRules,
          random,
        })
      : idle;
    const isIdleChanged = !isSameIdlePose(nextIdle.pose, idle.pose);
    idle = nextIdle;
    if (next.kind === "closed" && mouth.kind === "closed" && !isIdleChanged) return;
    mouth = next;
    publish(next);
  };

  // Chaque pas est visé à date fixe : sous Windows un minuteur arrive jusqu'à ~15 ms en retard, un `setInterval` en cumulerait.
  let nextAt = 0;
  const tick = () => {
    step();
    nextAt = Math.max(nextAt + plan.rhythm, clock());
    timer = setTimeout(tick, nextAt - clock());
  };

  const schedule = () => {
    nextAt = clock() + plan.rhythm;
    timer = setTimeout(tick, plan.rhythm);
  };

  return {
    feed,
    start() {
      unsubscribe = mic.subscribe((level) => {
        peak = Math.max(peak, level);
        if (isLoud(level, plan.settings.threshold)) lastLoudAt = clock();
      });
      schedule();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      clearTimeout(timer);
      timer = undefined;
    },
    update(next) {
      plan = toLoopPlan(head, next);
      // La pose de repos repart de neutre, avec un intervalle complet : ses réglages viennent peut-être de changer.
      idle = IDLE_START;
      if (timer !== undefined) {
        clearTimeout(timer);
        schedule();
      }
      publish(mouth);
    },
  };
}
