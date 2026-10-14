import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  isYesterday,
  OBSERVATION_MS,
  toAwayText,
  toLiveCounts,
  toParisDay,
  toVisit,
  toWelcomePlan,
  toWelcomeRules,
} from "./regulars.rules";
import type { Regular } from "./regulars.schema";
import type { Settings } from "./settings.schema";

const HOUR_MS = 3_600_000;
const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShouldWelcome: true,
  foxWelcomeLiveGap: 6 * HOUR_MS,
  foxWelcomeLiveCounts: ["10", "25", "abc", "0", "50", "100"],
  foxWelcomeReturnAfter: 14 * DAY_MS,
  foxWelcomeMilestone: ["{user} ! {lives}e live."],
  foxWelcomeReturn: ["{user} ! {absence} sans nouvelles."],
  foxWelcomeYesterday: ["Oh, {user}, tu étais là hier !"],
  foxWelcomeFirst: ["Un nouveau ! Bienvenue, {user}."],
};

describe("toWelcomeRules : les réglages de l'accueil", () => {
  it("les lit, les nombres de lives en nombres (une ligne illisible est ignorée)", () => {
    expect(toWelcomeRules(settings)).toEqual({
      shouldWelcome: true,
      liveGap: 6 * HOUR_MS,
      liveCounts: [10, 25, 50, 100],
      returnAfter: 14 * DAY_MS,
      phrases: {
        foxWelcomeMilestone: ["{user} ! {lives}e live."],
        foxWelcomeReturn: ["{user} ! {absence} sans nouvelles."],
        foxWelcomeYesterday: ["Oh, {user}, tu étais là hier !"],
        foxWelcomeFirst: ["Un nouveau ! Bienvenue, {user}."],
      },
    });
  });

  it("n'en rend aucune quand un réglage manque : tous ou aucun", () => {
    const { foxWelcomeFirst: _missing, ...partial } = settings;
    expect(toWelcomeRules(partial)).toBeUndefined();
    expect(
      toWelcomeRules({ obsAddress: "ws://x", micName: "m", threshold: -40, delay: 250 }),
    ).toBeUndefined();
  });

  it("ignore les lignes qui ne sont pas des nombres entiers positifs", () => {
    expect(toLiveCounts(["10", " 25 ", "1,5", "-3", "0", "", "dix"])).toEqual([10, 25]);
  });
});

describe("toVisit : un live de plus après plus de 6 h de silence", () => {
  const known: Regular = { firstSeen: 1000, lastSeen: 5000, lives: 3 };

  it("crée le viewer inconnu : sa première venue, sa dernière venue, un live", () => {
    expect(toVisit(undefined, 9000, 6 * HOUR_MS)).toEqual({
      regular: { firstSeen: 9000, lastSeen: 9000, lives: 1 },
      isLiveStart: true,
    });
  });

  it("garde le même live tant que le silence ne dépasse pas 6 h, et avance sa dernière venue", () => {
    const visit = toVisit(known, 5000 + 6 * HOUR_MS, 6 * HOUR_MS);
    expect(visit).toEqual({
      regular: { firstSeen: 1000, lastSeen: 5000 + 6 * HOUR_MS, lives: 3 },
      isLiveStart: false,
    });
  });

  it("compte un live de plus dès que le silence dépasse 6 h", () => {
    expect(toVisit(known, 5000 + 6 * HOUR_MS + 1, 6 * HOUR_MS)).toEqual({
      regular: { firstSeen: 1000, lastSeen: 5000 + 6 * HOUR_MS + 1, lives: 4 },
      isLiveStart: true,
    });
  });

  it("suit le silence réglé", () => {
    expect(toVisit(known, 5000 + 2 * HOUR_MS, HOUR_MS).isLiveStart).toBe(true);
    expect(toVisit(known, 5000 + 2 * HOUR_MS, 3 * HOUR_MS).isLiveStart).toBe(false);
  });
});

describe("toParisDay et isYesterday : le jour calendaire à Paris", () => {
  it("donne le jour de Paris, pas celui d'UTC", () => {
    expect(toParisDay(Date.UTC(2026, 9, 13, 22, 30))).toBe("2026-10-14");
    expect(toParisDay(Date.UTC(2026, 9, 13, 21, 30))).toBe("2026-10-13");
    expect(toParisDay(Date.UTC(2026, 0, 15, 23, 30))).toBe("2026-01-16");
  });

  it("reconnaît la veille, même quand un seul passage de minuit les sépare (heure d'été et d'hiver)", () => {
    expect(isYesterday(Date.UTC(2026, 9, 13, 10, 0), Date.UTC(2026, 9, 14, 20, 0))).toBe(true);
    expect(isYesterday(Date.UTC(2026, 9, 13, 21, 30), Date.UTC(2026, 9, 13, 22, 30))).toBe(true);
    expect(isYesterday(Date.UTC(2026, 0, 15, 22, 30), Date.UTC(2026, 0, 15, 23, 30))).toBe(true);
  });

  it("ne reconnaît ni le même jour à Paris, ni l'avant-veille, ni le lendemain", () => {
    expect(isYesterday(Date.UTC(2026, 9, 13, 22, 30), Date.UTC(2026, 9, 14, 5, 0))).toBe(false);
    expect(isYesterday(Date.UTC(2026, 9, 12, 10, 0), Date.UTC(2026, 9, 14, 10, 0))).toBe(false);
    expect(isYesterday(Date.UTC(2026, 9, 14, 10, 0), Date.UTC(2026, 9, 13, 10, 0))).toBe(false);
  });

  it("passe un changement d'heure sans décaler les jours", () => {
    // Le 25 octobre 2026, Paris repasse à l'heure d'hiver : ce jour dure 25 h.
    expect(isYesterday(Date.UTC(2026, 9, 24, 20, 0), Date.UTC(2026, 9, 25, 20, 0))).toBe(true);
    expect(isYesterday(Date.UTC(2026, 9, 25, 20, 0), Date.UTC(2026, 9, 26, 22, 30))).toBe(true);
  });
});

describe("toAwayText : la durée dite d'une absence", () => {
  it("dit les semaines, puis les mois", () => {
    expect(toAwayText(14 * DAY_MS)).toBe("2 semaines");
    expect(toAwayText(20 * DAY_MS + 5 * HOUR_MS)).toBe("2 semaines");
    expect(toAwayText(21 * DAY_MS)).toBe("3 semaines");
    expect(toAwayText(29 * DAY_MS)).toBe("4 semaines");
    expect(toAwayText(30 * DAY_MS)).toBe("1 mois");
    expect(toAwayText(59 * DAY_MS)).toBe("1 mois");
    expect(toAwayText(60 * DAY_MS)).toBe("2 mois");
  });

  it("dit les jours quand l'absence réglée est courte, et les ans quand elle est très longue", () => {
    expect(toAwayText(DAY_MS)).toBe("1 jour");
    expect(toAwayText(3 * DAY_MS)).toBe("3 jours");
    expect(toAwayText(7 * DAY_MS)).toBe("1 semaine");
    expect(toAwayText(365 * DAY_MS)).toBe("1 an");
    expect(toAwayText(800 * DAY_MS)).toBe("2 ans");
  });
});

describe("toWelcomePlan : la phrase d'accueil d'un viewer qui commence un live", () => {
  const rules = { liveCounts: [10, 25, 50, 100], returnAfter: 14 * DAY_MS };
  const now = Date.UTC(2026, 9, 14, 20, 0);
  const createdAt = now - 60 * DAY_MS;
  const input = (previous: Regular | undefined, lives: number, overrides: { createdAt?: number } = {}) => ({
    previous,
    regular: { firstSeen: now - 30 * DAY_MS, lastSeen: now, lives },
    nickname: "Alice",
    now,
    createdAt,
    ...overrides,
  });
  const seen = (daysAgo: number): Regular => ({
    firstSeen: now - 30 * DAY_MS,
    lastSeen: now - daysAgo * DAY_MS,
    lives: 4,
  });

  it("un palier de lives : le nombre de lives du viewer", () => {
    expect(toWelcomePlan(input(seen(3), 10), rules)).toEqual({
      list: "foxWelcomeMilestone",
      values: { user: "Alice", lives: 10 },
    });
    expect(toWelcomePlan(input(seen(3), 100), rules)?.list).toBe("foxWelcomeMilestone");
    expect(toWelcomePlan(input(seen(3), 11), rules)).toBeNull();
  });

  it("un retour après 14 jours ou plus : la durée de l'absence", () => {
    expect(toWelcomePlan(input(seen(14), 5), rules)).toEqual({
      list: "foxWelcomeReturn",
      values: { user: "Alice", absence: "2 semaines" },
    });
    expect(toWelcomePlan(input(seen(33), 5), rules)).toEqual({
      list: "foxWelcomeReturn",
      values: { user: "Alice", absence: "1 mois" },
    });
    expect(toWelcomePlan(input(seen(13), 5), rules)).toBeNull();
  });

  it("la venue de la veille", () => {
    expect(toWelcomePlan(input(seen(1), 5), rules)).toEqual({
      list: "foxWelcomeYesterday",
      values: { user: "Alice" },
    });
    expect(toWelcomePlan(input(seen(2), 5), rules)).toBeNull();
  });

  it("le tout premier message sur la chaîne", () => {
    expect(toWelcomePlan(input(undefined, 1), rules)).toEqual({
      list: "foxWelcomeFirst",
      values: { user: "Alice" },
    });
  });

  it("le palier passe devant le retour, le retour devant la veille", () => {
    expect(toWelcomePlan(input(seen(20), 25), rules)?.list).toBe("foxWelcomeMilestone");
    expect(toWelcomePlan(input(seen(20), 26), rules)?.list).toBe("foxWelcomeReturn");
    // Une absence réglée à 1 jour : la veille est aussi un retour, et le retour gagne.
    expect(toWelcomePlan(input(seen(1), 26), { ...rules, returnAfter: DAY_MS })?.list).toBe(
      "foxWelcomeReturn",
    );
  });

  it("le palier passe devant le tout premier message", () => {
    expect(toWelcomePlan(input(undefined, 10), rules)?.list).toBe("foxWelcomeMilestone");
  });

  it("pendant les 14 premiers jours du fichier : personne n'est nouveau, personne ne revient, mais un palier et la veille restent dits", () => {
    const young = { createdAt: now - OBSERVATION_MS + 1 };
    expect(toWelcomePlan(input(undefined, 1, young), rules)).toBeNull();
    expect(toWelcomePlan(input(seen(20), 5, young), rules)).toBeNull();
    expect(toWelcomePlan(input(seen(1), 5, young), rules)?.list).toBe("foxWelcomeYesterday");
    expect(toWelcomePlan(input(seen(3), 10, young), rules)?.list).toBe("foxWelcomeMilestone");
  });

  it("le 14e jour du fichier, un nouveau est annoncé", () => {
    expect(toWelcomePlan(input(undefined, 1, { createdAt: now - OBSERVATION_MS }), rules)?.list).toBe(
      "foxWelcomeFirst",
    );
  });
});
