import type { Settings } from "./settings.schema";

// La balance : l'écart (dB) toléré du desktop sur la voix, la parole cumulée (ms) pendant laquelle il la couvre avant
// d'alerter, et l'écart (ms) entre deux alertes.
export type BalanceRules = { margin: number; after: number; gap: number };

// Sans les réglages du renard (tous ou aucun), pas de balance.
export function toBalanceRules({
  foxBalanceMargin,
  foxBalanceAfter,
  foxBalanceGap,
}: Settings): BalanceRules | undefined {
  if (foxBalanceMargin === undefined || foxBalanceAfter === undefined || foxBalanceGap === undefined)
    return undefined;
  return { margin: foxBalanceMargin, after: foxBalanceAfter, gap: foxBalanceGap };
}

// Le lissage : le pic d'une source monte tout de suite et retombe d'un facteur e par seconde (20·log10(e) = 8,7 dB). Voix et
// desktop se comparent ainsi pic à pic ; une syllabe faible entre deux mots ne donne pas le jeu gagnant.
export const BALANCE_RELEASE_MS = 1000;
const RELEASE_DB = 20 * Math.log10(Math.E);
const FLOOR = -100;

// Le dernier pic d'une source (dB) et l'instant où il a été mesuré.
export type Envelope = { level: number; at: number | null };

export const ENVELOPE_START: Envelope = { level: FLOOR, at: null };

// Le pic lissé à `now`, retombé depuis sa mesure.
export const toEnvelopeLevel = ({ level, at }: Envelope, now: number): number =>
  at === null ? FLOOR : Math.max(FLOOR, level - (RELEASE_DB * Math.max(0, now - at)) / BALANCE_RELEASE_MS);

export const toNextEnvelope = (
  previous: Envelope,
  { now, level }: { now: number; level: number },
): Envelope => ({
  level: Math.max(level, toEnvelopeLevel(previous, now)),
  at: now,
});

// Combien de parole cumulée le desktop couvre la voix de Fenysk, et l'instant du dernier pas.
export type Balance = { loudFor: number; at: number | null };

export const BALANCE_START: Balance = { loudFor: 0, at: null };

// `voice` et `desktop` : les pics lissés (dB) ; `silentFor` : depuis combien de ms Fenysk ne dit plus rien.
export type BalanceInput = {
  now: number;
  isTalking: boolean;
  silentFor: number;
  voice: number;
  desktop: number;
};

// Un pas plus long (serveur occupé) ne compte que pour une demi-seconde.
const MAX_STEP_MS = 500;

// Le desktop est au moins aussi fort que la voix, à `margin` dB près.
const isDesktopAsLoud = ({ voice, desktop }: BalanceInput, { margin }: BalanceRules): boolean =>
  desktop >= voice + margin;

// Le compte avance quand Fenysk parle et que le desktop couvre sa voix ; il repart de zéro quand sa voix passe devant, ou
// après un silence plus long que `after`. Quand il se tait un moment, le compte attend : un jeu fort est alors normal.
export function toNextBalance(previous: Balance, input: BalanceInput, rules: BalanceRules): Balance {
  const { now, isTalking, silentFor } = input;
  const step = previous.at === null ? 0 : Math.min(now - previous.at, MAX_STEP_MS);
  if (!isTalking) return { loudFor: silentFor > rules.after ? 0 : previous.loudFor, at: now };
  return { loudFor: isDesktopAsLoud(input, rules) ? previous.loudFor + step : 0, at: now };
}

// L'alerte est due : le desktop couvre la voix depuis `after` ms de parole, et la dernière alerte est assez loin
// (`sinceLast`, infini s'il n'y en a pas eu).
export const isBalanceDue = (
  { balance, sinceLast }: { balance: Balance; sinceLast: number },
  { after, gap }: BalanceRules,
): boolean => balance.loudFor >= after && sinceLast >= gap;
