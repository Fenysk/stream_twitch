import { describe, expect, it } from "vitest";
import {
  BALANCE_START,
  type Balance,
  type BalanceInput,
  type BalanceRules,
  ENVELOPE_START,
  isBalanceDue,
  toBalanceRules,
  toEnvelopeLevel,
  toNextBalance,
  toNextEnvelope,
} from "./balance.rules";
import type { Settings } from "./settings.schema";

const rules: BalanceRules = { margin: 0, after: 10_000, gap: 300_000 };
const FOREVER = Number.POSITIVE_INFINITY;

describe("toBalanceRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend l'écart, la durée et l'écart entre deux alertes des réglages", () => {
    expect(
      toBalanceRules({ ...base, foxBalanceMargin: 0, foxBalanceAfter: 10_000, foxBalanceGap: 300_000 }),
    ).toEqual(rules);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toBalanceRules(base)).toBeUndefined();
  });
});

describe("toNextEnvelope : le pic lissé d'une source", () => {
  it("vaut le plancher tant qu'aucun level n'est arrivé", () => {
    expect(toEnvelopeLevel(ENVELOPE_START, 1000)).toBe(-100);
  });

  it("monte tout de suite au level reçu", () => {
    const envelope = toNextEnvelope(ENVELOPE_START, { now: 1000, level: -12 });
    expect(toEnvelopeLevel(envelope, 1000)).toBe(-12);
  });

  it("retombe de 8,7 dB en 1 s, sans plonger sous le plancher", () => {
    const envelope = toNextEnvelope(ENVELOPE_START, { now: 1000, level: -12 });
    expect(toEnvelopeLevel(envelope, 2000)).toBeCloseTo(-20.7, 1);
    expect(toEnvelopeLevel(envelope, 3000)).toBeCloseTo(-29.4, 1);
    expect(toEnvelopeLevel(envelope, 1_000_000)).toBe(-100);
  });

  it("garde le pic précédent encore plus fort qu'un level plus faible qui suit", () => {
    const first = toNextEnvelope(ENVELOPE_START, { now: 1000, level: -12 });
    const second = toNextEnvelope(first, { now: 1050, level: -30 });
    expect(toEnvelopeLevel(second, 1050)).toBeCloseTo(-12.4, 1);
  });

  it("monte au level qui dépasse la retombée du pic précédent", () => {
    const first = toNextEnvelope(ENVELOPE_START, { now: 1000, level: -12 });
    const second = toNextEnvelope(first, { now: 3000, level: -15 });
    expect(toEnvelopeLevel(second, 3000)).toBe(-15);
  });
});

describe("toNextBalance : la parole cumulée où le desktop couvre la voix", () => {
  const talking: BalanceInput = { now: 10_000, isTalking: true, silentFor: 0, voice: -20, desktop: -20 };
  const started: Balance = { loudFor: 0, at: 9900 };

  it("compte le temps écoulé quand Fenysk parle et que le desktop est aussi fort que sa voix", () => {
    expect(toNextBalance(started, talking, rules)).toEqual({ loudFor: 100, at: 10_000 });
  });

  it("compte aussi quand le desktop est plus fort", () => {
    expect(toNextBalance(started, { ...talking, desktop: -10 }, rules).loudFor).toBe(100);
  });

  it("repart de zéro dès que la voix passe devant le desktop", () => {
    const loud: Balance = { loudFor: 7000, at: 9900 };
    expect(toNextBalance(loud, { ...talking, voice: -19.9 }, rules)).toEqual({ loudFor: 0, at: 10_000 });
  });

  it("ne compte rien, mais ne perd rien, quand Fenysk se tait un moment : un jeu fort est normal", () => {
    const loud: Balance = { loudFor: 7000, at: 9900 };
    const quiet = { ...talking, isTalking: false, silentFor: 4000 };
    expect(toNextBalance(loud, quiet, rules)).toEqual({ loudFor: 7000, at: 10_000 });
  });

  it("oublie le compte après un silence plus long que la durée d'alerte", () => {
    const loud: Balance = { loudFor: 7000, at: 9900 };
    const away = { ...talking, isTalking: false, silentFor: 10_001 };
    expect(toNextBalance(loud, away, rules)).toEqual({ loudFor: 0, at: 10_000 });
    expect(toNextBalance(loud, { ...away, silentFor: 10_000 }, rules).loudFor).toBe(7000);
  });

  it("tient compte de l'écart réglé : positif, le jeu doit dépasser la voix de cet écart", () => {
    const tolerant: BalanceRules = { ...rules, margin: 5 };
    expect(toNextBalance(started, { ...talking, desktop: -15.1 }, tolerant).loudFor).toBe(0);
    expect(toNextBalance(started, { ...talking, desktop: -15 }, tolerant).loudFor).toBe(100);
  });

  it("tient compte de l'écart réglé : négatif, il alerte alors que la voix est encore devant", () => {
    const strict: BalanceRules = { ...rules, margin: -5 };
    expect(toNextBalance(started, { ...talking, desktop: -25 }, strict).loudFor).toBe(100);
    expect(toNextBalance(started, { ...talking, desktop: -25.1 }, strict).loudFor).toBe(0);
  });

  it("ne compte qu'une demi-seconde d'un pas très long : un serveur occupé ne fait pas alerter", () => {
    const stale: Balance = { loudFor: 0, at: 0 };
    expect(toNextBalance(stale, talking, rules).loudFor).toBe(500);
  });

  it("ne compte rien au premier pas", () => {
    expect(toNextBalance(BALANCE_START, talking, rules)).toEqual({ loudFor: 0, at: 10_000 });
  });
});

describe("isBalanceDue : 10 s de parole couverte, au plus une alerte toutes les 5 min", () => {
  it("est due à 10 s pile, pas avant", () => {
    expect(isBalanceDue({ balance: { loudFor: 9999, at: 0 }, sinceLast: FOREVER }, rules)).toBe(false);
    expect(isBalanceDue({ balance: { loudFor: 10_000, at: 0 }, sinceLast: FOREVER }, rules)).toBe(true);
  });

  it("attend l'écart de 5 min depuis la dernière alerte", () => {
    const balance = { loudFor: 12_000, at: 0 };
    expect(isBalanceDue({ balance, sinceLast: 299_999 }, rules)).toBe(false);
    expect(isBalanceDue({ balance, sinceLast: 300_000 }, rules)).toBe(true);
  });
});
