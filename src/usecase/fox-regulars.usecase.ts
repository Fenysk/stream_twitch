import type { RawMessage } from "../domain/chat.types";
import { type InsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { isFillable, toFilledPhrase } from "../domain/phrase.rules";
import { toNextPick } from "../domain/pick.rules";
import {
  toVisit,
  toWelcomePlan,
  toWelcomeRules,
  WELCOME_GAP_MS,
  type WelcomeInput,
  type WelcomeKey,
  type WelcomeRules,
} from "../domain/regulars.rules";
import type { Regular, RegularsFile } from "../domain/regulars.schema";
import type { Settings } from "../domain/settings.schema";

// Le fichier des viewers connus (data/viewers.json) vu du usecase : infra l'implémente. `get` rend `undefined` quand il n'existe
// pas (ou qu'il était illisible) ; `update` peut lever.
export type RegularsPort = { get(): RegularsFile | undefined; update(file: RegularsFile): void };

export type FoxRegularsDeps = {
  port: RegularsPort;
  settings: Settings;
  insults: InsultList;
  clock: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  random: () => number;
  log: (message: string) => void;
};

export type FoxRegulars = {
  // Écrit le fichier s'il n'existe pas encore : sa date de création compte.
  start(): void;
  // Écrit ce qui ne l'est pas encore.
  stop(): void;
  update(settings: Settings): void;
  // Un message accepté d'un viewer (pas du compte de la chaîne) : le fichier retient sa venue, un live de plus si son dernier
  // message date de plus de `foxWelcomeLiveGap`. Rend la phrase d'accueil à dire avant ce message, ou `null` (`canWelcome` :
  // une autre phrase passe devant, le fichier est mis à jour quand même).
  noteMessage(raw: RawMessage, options: { canWelcome: boolean }): string | null;
};

// Le fichier s'écrit au plus toutes les 5 s : le dernier message d'un viewer le met à jour à chaque fois.
const FLUSH_DELAY_MS = 5000;

// Le nom de chaque cas dans le journal.
const LIST_TEXTS: Record<WelcomeKey, string> = {
  foxWelcomeMilestone: "palier de lives",
  foxWelcomeReturn: "retour après une absence",
  foxWelcomeYesterday: "venu la veille",
  foxWelcomeFirst: "premier message sur la chaîne",
};

const toEmptySaid = (): Record<WelcomeKey, string[]> => ({
  foxWelcomeMilestone: [],
  foxWelcomeReturn: [],
  foxWelcomeYesterday: [],
  foxWelcomeFirst: [],
});

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Les habitués : data/viewers.json garde, par viewer (login en minuscules), sa première venue, sa dernière venue et son nombre
// de lives, jamais ce qu'il écrit. Au premier message d'un viewer dans un live, le renard tire une phrase d'accueil tournée vers
// le chat : un palier de lives, un retour après une longue absence, la veille, ou le tout premier message (dans cet ordre, sans
// répéter avant d'avoir tout dit). Au plus une toutes les 30 s ; un pseudo refusé par le filtre d'insultes n'a pas de phrase. Le
// fichier continue de s'écrire quand la case est décochée : le retour d'une absence reste vérifiable.
export function createFoxRegulars({
  port,
  settings: initial,
  insults,
  clock,
  schedule,
  random,
  log,
}: FoxRegularsDeps): FoxRegulars {
  const stored = port.get();
  const createdAt = stored?.createdAt ?? clock();
  const viewers = new Map<string, Regular>(Object.entries(stored?.viewers ?? {}));
  let rules: WelcomeRules | undefined = toWelcomeRules(initial);
  let lastWelcomeAt: number | null = null;
  const said = toEmptySaid();
  let isDirty = stored === undefined;
  let cancelFlush: (() => void) | undefined;

  const flush = () => {
    cancelFlush?.();
    cancelFlush = undefined;
    if (!isDirty) return;
    isDirty = false;
    try {
      port.update({ createdAt, viewers: Object.fromEntries(viewers) });
    } catch (error) {
      isDirty = true;
      log(`Renard : habitués non enregistrés (${toMessage(error)}), nouvel essai à la prochaine venue.`);
    }
  };

  const planFlush = () => {
    isDirty = true;
    cancelFlush ??= schedule(flush, FLUSH_DELAY_MS);
  };

  const welcome = (nickname: string, input: Omit<WelcomeInput, "nickname" | "createdAt">): string | null => {
    if (!rules) return null;
    if (lastWelcomeAt !== null && input.now - lastWelcomeAt < WELCOME_GAP_MS) return null;
    if (toInsultMatch(nickname, insults) !== null) {
      log("Renard : pseudo refusé par le filtre d'insultes (accueil), pas de phrase d'accueil.");
      return null;
    }
    const plan = toWelcomePlan({ ...input, nickname, createdAt }, rules);
    if (!plan) return null;
    const candidates = rules.phrases[plan.list].filter((phrase) => isFillable(phrase, plan.values));
    const pick = toNextPick(candidates, said[plan.list], random);
    if (!pick) return null;
    said[plan.list] = pick.said;
    lastWelcomeAt = input.now;
    const text = toFilledPhrase(pick.phrase, plan.values);
    log(`Renard : accueil (${LIST_TEXTS[plan.list]}) : « ${text} »`);
    return text;
  };

  return {
    start() {
      if (isDirty) flush();
    },
    stop: flush,
    update(next) {
      rules = toWelcomeRules(next);
    },
    noteMessage(raw, { canWelcome }) {
      if (!rules) return null;
      const now = clock();
      const login = raw.viewerLogin.toLowerCase();
      const previous = viewers.get(login);
      const { regular, isLiveStart } = toVisit(previous, now, rules.liveGap);
      viewers.set(login, regular);
      planFlush();
      if (!isLiveStart || !canWelcome || !rules.shouldWelcome) return null;
      return welcome(raw.nickname, { previous, regular, now });
    },
  };
}
