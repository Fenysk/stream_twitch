import {
  type FoxModeRules,
  isHeldShow,
  type Show,
  toFoxMode,
  toFoxModeRules,
  toShowMs,
} from "../domain/fox-mode.rules";
import {
  isVoiceTalking,
  toNextVoice,
  toSilentFor,
  toTalkingFor,
  VOICE_START,
  type Voice,
} from "../domain/listening.rules";
import {
  type PresenceEvent,
  type PresenceRules,
  type PresenceState,
  toNextPresence,
  toPresenceView,
  toStartPresence,
  toVisibleIn,
} from "../domain/presence.rules";
import type { Settings } from "../domain/settings.schema";
import type { Fox, SpeakResult } from "./fox.usecase";
import type { MicPort } from "./head.usecase";

export type FoxModeDeps = {
  mic: MicPort;
  fox: Pick<Fox, "speak" | "updateMode" | "updatePresence">;
  settings: Settings;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

// Ce que le renard sait d'Alexis, d'après la détection de la tête : parle-t-il, depuis quand, et se tait-il depuis quand.
export type VoiceView = { isTalking: boolean; talkingFor: number; silentFor: number };

// L'entrée en scène avant une phrase : le retour s'il était parti, puis la réaction ou le coucou. `ready` se tient quand
// la phrase peut partir ; `cancel` efface ce qu'il montrait et libère `ready`.
export type Intro = { ready: Promise<void>; cancel(): void };

export type FoxModeController = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  getVoice(): VoiceView;
  // H : un message vient d'être accepté. Il revient s'il était parti ; rend dans combien de ms il est entièrement visible.
  wake(): number;
  // H : une phrase vient de finir, le délai avant le départ repart de zéro.
  noteSpoke(): void;
  // H : une page `/fox` vient de se connecter, il est visible.
  reset(): void;
  // E, G et H : il revient s'il était parti, puis montre `show` pendant la durée d'une réaction (sans `show`, rien).
  introduce(show: Show | null): Intro;
  // « Faire parler » : il revient s'il était parti, puis dit la phrase. Ni D ni la file n'y touchent.
  say(text: string): Promise<SpeakResult>;
  // Appelé à chaque pas (100 ms) : de quoi attendre le silence d'Alexis, ou couper une lecture.
  subscribe(listener: () => void): () => void;
};

const TICK_MS = 100;

const toPresenceRules = ({ awayAfter, yawnMs, leaveMs, returnMs }: FoxModeRules): PresenceRules => ({
  awayAfter,
  yawnMs,
  leaveMs,
  returnMs,
});

const PRESENCE_LOGS: Partial<Record<PresenceState["kind"], string>> = {
  yawning: "Renard : il n'a pas parlé depuis un moment, il bâille puis s'en va.",
  away: "Renard : il est parti.",
  returning: "Renard : il revient.",
};

export function createFoxMode({
  mic,
  fox,
  settings: initial,
  clock,
  schedule,
  log,
}: FoxModeDeps): FoxModeController {
  let rules = toFoxModeRules(initial);
  let voice: Voice = VOICE_START;
  let presence: PresenceState = toStartPresence(clock());
  let shown: Show | null = null;
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined;
  let cancelTick: (() => void) | undefined;

  // Les pages reçoivent la présence et le mode quand ils changent (le usecase du renard ne publie que les changements).
  const publish = () => {
    fox.updatePresence(toPresenceView(presence));
    fox.updateMode(
      toFoxMode({
        show: shown,
        isTalking: rules ? isVoiceTalking(voice, clock(), rules.delay) : false,
        isYawning: presence.kind === "yawning",
      }),
    );
  };

  const step = (event?: PresenceEvent) => {
    if (!rules) return;
    const before = presence.kind;
    presence = toNextPresence(presence, { now: clock(), event }, toPresenceRules(rules));
    const line = presence.kind === before ? undefined : PRESENCE_LOGS[presence.kind];
    if (line) log(line);
  };

  const hear = (level?: number) => {
    if (rules)
      voice = toNextVoice(voice, { now: clock(), level, threshold: rules.threshold, delay: rules.delay });
  };

  const tick = () => {
    hear();
    step();
    publish();
    for (const listener of listeners) listener();
    cancelTick = schedule(tick, TICK_MS);
  };

  const wake = (): number => {
    if (!rules) return 0;
    step("wake");
    publish();
    return toVisibleIn(presence, clock(), toPresenceRules(rules));
  };

  // Il revient s'il était parti, montre `show` le temps qu'il faut, puis libère la phrase (`ready`). Une réaction ou un coucou
  // s'efface alors ; le retournement vers Fenysk reste jusqu'à `cancel`, que la file appelle à la fin de la phrase.
  const introduce = (show: Show | null): Intro => {
    const visibleMs = wake();
    const showMs = show && rules ? toShowMs(show, rules) : 0;
    const isHeld = show !== null && isHeldShow(show);
    let isShown = false;
    const cancels: (() => void)[] = [];
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hide = () => {
      if (!isShown) return;
      isShown = false;
      shown = null;
      publish();
    };
    const showNow = () => {
      shown = show;
      isShown = true;
      publish();
    };
    const complete = () => {
      if (!isHeld) hide();
      release();
    };
    if (showMs > 0) {
      if (visibleMs === 0) showNow();
      else cancels.push(schedule(showNow, visibleMs));
    }
    if (visibleMs + showMs > 0) cancels.push(schedule(complete, visibleMs + showMs));
    else complete();
    return {
      ready,
      cancel() {
        for (const cancel of cancels) cancel();
        hide();
        release();
      },
    };
  };

  return {
    start() {
      unsubscribe ??= mic.subscribe(hear);
      cancelTick ??= schedule(tick, TICK_MS);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      cancelTick?.();
      cancelTick = undefined;
    },
    update(next) {
      rules = toFoxModeRules(next);
      publish();
    },
    getVoice() {
      const now = clock();
      return {
        isTalking: rules ? isVoiceTalking(voice, now, rules.delay) : false,
        talkingFor: toTalkingFor(voice, now),
        silentFor: toSilentFor(voice, now),
      };
    },
    wake,
    noteSpoke() {
      step("spoke");
    },
    reset() {
      step("reset");
      publish();
    },
    introduce,
    async say(text) {
      const intro = introduce(null);
      const result = await fox.speak(text, { waitFor: intro.ready });
      if (result.ok) schedule(() => step("spoke"), result.durationMs);
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
