import type { Settings } from "./settings.schema";
import { toSpokenDuration } from "./spoken-time.rules";

const MINUTE_MS = 60_000;

// Un retour demande de la vraie parole, pas une toux ni un bruit : au moins RETURN_TALK_MS de voix cumulée sur les
// RETURN_WINDOW_MS derniers ms. Pas de réglage : la valeur ne bouge pas.
const RETURN_TALK_MS = 1000;
const RETURN_WINDOW_MS = 3000;
// Un pas en retard (serveur figé un instant) ne compte pas plus que le delay de parole : une toux ne fait pas une seconde.
const TALK_STEP_MAX_MS = 250;

// Le retour : après `after` ms sans voix de Fenysk (mic coupé compris), il reparle ; `shouldHail` : le renard le salue.
export type ComebackRules = { after: number; shouldHail: boolean };

// Sans les réglages du renard (tous ou aucun), pas de retour.
export function toComebackRules({
  foxComebackAfter,
  foxShouldHailComeback,
}: Settings): ComebackRules | undefined {
  if (foxComebackAfter === undefined || foxShouldHailComeback === undefined) return undefined;
  return { after: foxComebackAfter, shouldHail: foxShouldHailComeback };
}

// De la voix à l'instant `at`, pour `ms` ms de parole.
type Talk = { at: number; ms: number };

// Où en est Fenysk : jamais entendu depuis le démarrage, là, ou parti. Parti : depuis quand sa voix se tait (`since`, ms), le
// dernier pas vu (`lastAt`) et la voix des RETURN_WINDOW_MS derniers ms (`talks`).
export type Comeback =
  | { kind: "unheard" }
  | { kind: "here" }
  | { kind: "gone"; since: number; lastAt: number; talks: readonly Talk[] };

export const COMEBACK_START: Comeback = { kind: "unheard" };

const HERE: Comeback = { kind: "here" };

// `isTalking` : sa voix est au-dessus du threshold (D) ; `silentFor` : depuis combien de ms il ne dit plus rien (infini s'il
// n'a rien dit depuis le démarrage).
export type ComebackInput = { now: number; isTalking: boolean; silentFor: number; after: number };

// `goneFor` : la durée de l'absence (ms), seulement au pas où il revient ; sinon null.
export type ComebackStep = { comeback: Comeback; goneFor: number | null };

const toTalks = (previous: Extract<Comeback, { kind: "gone" }>, now: number, isTalking: boolean): Talk[] => {
  const recent = previous.talks.filter(({ at }) => at > now - RETURN_WINDOW_MS);
  return isTalking ? [...recent, { at: now, ms: Math.min(now - previous.lastAt, TALK_STEP_MAX_MS) }] : recent;
};

// Une absence ne commence qu'après une première parole : la première phrase d'une session n'est pas un retour. Parti, il ne
// revient que par RETURN_TALK_MS de voix : une toux ne remet pas l'absence à zéro.
export function toNextComeback(
  previous: Comeback,
  { now, isTalking, silentFor, after }: ComebackInput,
): ComebackStep {
  if (silentFor === Number.POSITIVE_INFINITY) return { comeback: COMEBACK_START, goneFor: null };
  if (previous.kind === "unheard") return { comeback: HERE, goneFor: null };
  if (previous.kind === "here") {
    const left: Comeback = { kind: "gone", since: now - silentFor, lastAt: now, talks: [] };
    return { comeback: silentFor >= after ? left : HERE, goneFor: null };
  }
  const talks = toTalks(previous, now, isTalking);
  if (talks.reduce((sum, { ms }) => sum + ms, 0) >= RETURN_TALK_MS)
    return { comeback: HERE, goneFor: now - previous.since };
  return { comeback: { ...previous, lastAt: now, talks }, goneFor: null };
}

// La durée de l'absence dite à voix haute : en minutes entières, une au moins (« 12 minutes », « 1 heure 10 »).
export const toSpokenGone = (goneFor: number): string =>
  toSpokenDuration(Math.max(1, Math.round(goneFor / MINUTE_MS)));
