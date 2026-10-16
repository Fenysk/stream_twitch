import { ADDRESS_MODE, YAWN_MODE } from "../domain/fox-mode.rules";
import {
  type HoursKey,
  type HoursPlan,
  type Stage,
  toClockTime,
  toEndStages,
  toHourCount,
  toHourPlan,
  toHoursRules,
  toLateFrom,
  toLateYawnDelay,
  toNextOccurrence,
  toStagePlan,
} from "../domain/hours.rules";
import { isFillable, toFilledPhrase } from "../domain/phrase.rules";
import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import { toCapitalized } from "../domain/spoken-time.rules";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { FoxReview } from "./fox-review.usecase";

// La diffusion d'OBS vue du usecase : en direct ou non, et depuis combien de ms (0 à son démarrage). Infra l'implémente ; le
// port rend l'état à la connexion d'OBS (le serveur peut démarrer en plein live), puis à chaque démarrage ou arrêt.
export type Broadcast = { isLive: boolean; duration: number };
export type BroadcastPort = { subscribe(listener: (broadcast: Broadcast) => void): () => void };

export type FoxHoursDeps = {
  broadcast: BroadcastPort;
  queue: Pick<FoxQueue, "push">;
  mode: Pick<FoxModeController, "subscribe" | "flash" | "leave">;
  // V : le bilan du live, dit juste après l'annonce de la fin prévue.
  review: Pick<FoxReview, "sayAtEnd">;
  settings: Settings;
  clock: () => number;
  random: () => number;
  log: (message: string) => void;
};

export type FoxHours = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
};

// Le nom de chaque sorte d'annonce dans le journal.
const LIST_TEXTS: Record<HoursKey, string> = {
  foxHourPhrases: "heure pleine de live",
  foxEndWarningPhrases: "avertissement calme de la fin prévue",
  foxEndSoonPhrases: "avertissement pressant de la fin prévue",
  foxEndPanicPhrases: "avertissement paniqué de la fin prévue",
  foxEndPhrases: "fin prévue",
  foxOvertimePhrases: "rappel après la fin prévue",
  foxBedtimePhrases: "coucher",
};

const toEmptySaid = (): Record<HoursKey, string[]> => ({
  foxHourPhrases: [],
  foxEndWarningPhrases: [],
  foxEndSoonPhrases: [],
  foxEndPanicPhrases: [],
  foxEndPhrases: [],
  foxOvertimePhrases: [],
  foxBedtimePhrases: [],
});

// L'heure du live : pendant la diffusion d'OBS seulement, le renard annonce chaque heure pleine au tchat, prévient Fenysk de la
// fin prévue à chaque palier (sur un ton qui monte : calme, pressant, paniqué) puis la lui annonce, le relance toutes les 10 min,
// et se couche au troisième rappel (il part, plus de rappel).
// Il bâille au repos, sans partir, après la fin prévue (ou après 23 h 30 sans fin prévue). Le bilan du live suit l'annonce de la
// fin prévue, une fois par diffusion. Chaque annonce passe par la file
// comme un remerciement ; caché, il revient pour elle, pas pour un bâillement. Ce qui est déjà passé quand il découvre la
// diffusion (le serveur démarre en plein live) ou quand un réglage change n'est pas redit.
export function createFoxHours({
  broadcast,
  queue,
  mode,
  review,
  settings: initial,
  clock,
  random,
  log,
}: FoxHoursDeps): FoxHours {
  let rules = toHoursRules(initial);
  // Quand la diffusion a commencé (l'heure du PC), ou `null` hors diffusion.
  let startedAt: number | null = null;
  let hoursDone = 0;
  let stages: Stage[] = [];
  let stagesDone = 0;
  let end: number | null = null;
  let lateFrom: number | null = null;
  let nextYawnAt: number | null = null;
  let hasSaidBedtime = false;
  let hasReviewed = false;
  const said = toEmptySaid();
  const unsubscribes: (() => void)[] = [];

  // Ce que la diffusion décide, calculé quand elle change ou qu'un réglage change : les étapes de la fin, dont celles déjà
  // passées sont faites, et l'heure après laquelle il bâille.
  const replan = (now: number) => {
    if (startedAt === null || !rules) {
      stages = [];
      stagesDone = 0;
      end = null;
      lateFrom = null;
      nextYawnAt = null;
      return;
    }
    const endTime = toClockTime(rules.endTime);
    end = endTime ? toNextOccurrence(startedAt, endTime) : null;
    stages = end !== null && !hasSaidBedtime ? toEndStages(end, rules) : [];
    stagesDone = stages.filter(({ at }) => at <= now).length;
    const nextLateFrom = toLateFrom(startedAt, end, rules.lateAfter);
    if (nextLateFrom !== lateFrom) nextYawnAt = null;
    lateFrom = nextLateFrom;
  };

  const say = ({ list, values, isForFenysk }: HoursPlan, afterwards?: () => void) => {
    const phrases = (rules?.phrases[list] ?? []).filter((phrase) => isFillable(phrase, values));
    const pick = toNextPick(phrases, said[list], random);
    if (!pick) {
      log(`Renard : aucune phrase possible pour ${LIST_TEXTS[list]}, rien n'est dit.`);
      afterwards?.();
      return;
    }
    said[list] = pick.said;
    const text = toCapitalized(toFilledPhrase(pick.phrase, values));
    log(`Renard : ${LIST_TEXTS[list]} : « ${text} »`);
    queue.push({
      kind: "hours",
      label: LIST_TEXTS[list],
      text,
      isCuttable: false,
      isUrgent: true,
      toShow: () => (isForFenysk ? ADDRESS_MODE : null),
      onDone: afterwards,
    });
  };

  // V : le bilan suit l'annonce de la fin prévue, une seule fois par diffusion.
  const sayReview = () => {
    if (hasReviewed) return;
    hasReviewed = true;
    review.sayAtEnd();
  };

  const goToBed = () => {
    log("Renard : il part se coucher, plus de rappel pour ce live.");
    mode.leave();
  };

  // Les étapes dues à `now` : seule la dernière se dit (un pas très en retard ne les enchaîne pas).
  const sayStages = (now: number) => {
    if (end === null || !rules) return;
    const due = stages.slice(stagesDone).filter(({ at }) => at <= now);
    stagesDone += due.length;
    const stage = due.at(-1);
    if (!stage) return;
    const announcement = toStagePlan(stage, { end, now });
    if (stage.kind !== "bedtime") {
      say(announcement, stage.kind === "end" ? sayReview : undefined);
      return;
    }
    hasSaidBedtime = true;
    stages = [];
    stagesDone = 0;
    say(announcement, goToBed);
  };

  const yawnLate = (now: number) => {
    if (lateFrom === null || now < lateFrom || !rules) return;
    nextYawnAt ??= now + toLateYawnDelay(rules, random);
    if (now < nextYawnAt) return;
    nextYawnAt = now + toLateYawnDelay(rules, random);
    if (mode.flash(YAWN_MODE) > 0) log("Renard : il est tard, il bâille.");
  };

  const onTick = () => {
    if (startedAt === null || !rules) return;
    const now = clock();
    const hours = toHourCount(startedAt, now);
    if (hours > hoursDone) {
      hoursDone = hours;
      say(toHourPlan(hours));
    }
    sayStages(now);
    yawnLate(now);
  };

  const onBroadcast = ({ isLive, duration }: Broadcast) => {
    const now = clock();
    if (!isLive) {
      startedAt = null;
      hasSaidBedtime = false;
      hasReviewed = false;
      replan(now);
      return;
    }
    if (startedAt === null) {
      hasSaidBedtime = false;
      hasReviewed = false;
    }
    startedAt = now - duration;
    hoursDone = toHourCount(startedAt, now);
    replan(now);
    log(`Renard : le live dure depuis ${Math.round(duration / 60_000)} min, il tient l'heure.`);
  };

  return {
    start() {
      if (unsubscribes.length > 0) return;
      unsubscribes.push(broadcast.subscribe(onBroadcast), mode.subscribe(onTick));
    },
    stop() {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    },
    update(next) {
      rules = toHoursRules(next);
      replan(clock());
    },
  };
}
