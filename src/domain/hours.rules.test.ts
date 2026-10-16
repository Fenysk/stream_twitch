import { describe, expect, it } from "vitest";
import {
  END_PANIC_MINUTES,
  END_SOON_MINUTES,
  HOUR_MS,
  type HoursRules,
  toClockTime,
  toEndStages,
  toEndStatus,
  toHourCount,
  toHourPlan,
  toHoursRules,
  toLateFrom,
  toLateYawnDelay,
  toNextOccurrence,
  toStagePlan,
  toSteppedEndTime,
  toWarningMarks,
} from "./hours.rules";
import type { Settings } from "./settings.schema";

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 9, day, hours, minutes, seconds).getTime();

describe("toHoursRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };
  const settings: Settings = {
    ...base,
    foxHourPhrases: ["H"],
    foxEndTime: "00:00",
    foxEndWarningMarks: ["15", "60", "30", "x", "15"],
    foxEndWarningPhrases: ["W"],
    foxEndSoonPhrases: ["S"],
    foxEndPanicPhrases: ["P"],
    foxEndPhrases: ["E"],
    foxOvertimeGap: 600_000,
    foxOvertimePhrases: ["O"],
    foxBedtimePhrases: ["B"],
    foxLateAfter: "23:30",
    foxLateYawnMin: 300_000,
    foxLateYawnMax: 600_000,
  };

  it("reprend les réglages de l'heure du live, avec leurs listes de phrases", () => {
    expect(toHoursRules(settings)).toEqual({
      endTime: "00:00",
      warningMarks: [60, 30, 15],
      overtimeGap: 600_000,
      lateAfter: "23:30",
      lateYawnMin: 300_000,
      lateYawnMax: 600_000,
      phrases: {
        foxHourPhrases: ["H"],
        foxEndWarningPhrases: ["W"],
        foxEndSoonPhrases: ["S"],
        foxEndPanicPhrases: ["P"],
        foxEndPhrases: ["E"],
        foxOvertimePhrases: ["O"],
        foxBedtimePhrases: ["B"],
      },
    } satisfies HoursRules);
  });

  it("ne donne aucune règle sans les réglages du renard, ni s'il en manque un", () => {
    expect(toHoursRules(base)).toBeUndefined();
    const { foxLateAfter: _missing, ...partial } = settings;
    expect(toHoursRules(partial)).toBeUndefined();
  });
});

describe("toWarningMarks : les paliers d'un réglage", () => {
  it("lit un nombre de minutes par ligne, du plus tôt avant la fin au plus tard, quel que soit l'ordre du réglage", () => {
    expect(toWarningMarks(["1", "60", "5", "30"])).toEqual([60, 30, 5, 1]);
  });

  it("ignore les doublons, et les lignes qui ne sont pas un entier de minutes positif", () => {
    expect(toWarningMarks(["10", "10", "5"])).toEqual([10, 5]);
    expect(toWarningMarks(["0", "-5", "1,5", "dix", "", "15"])).toEqual([15]);
  });

  it("n'a aucun palier pour une liste vide", () => {
    expect(toWarningMarks([])).toEqual([]);
  });
});

describe("toClockTime : une heure HH:MM", () => {
  it("lit l'heure et les minutes", () => {
    expect(toClockTime("23:30")).toEqual({ hours: 23, minutes: 30 });
    expect(toClockTime("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(toClockTime("07:05")).toEqual({ hours: 7, minutes: 5 });
  });

  it("rend null pour un texte vide (pas de fin prévue) ou qui n'est pas une heure", () => {
    expect(toClockTime("")).toBeNull();
    expect(toClockTime("24:00")).toBeNull();
    expect(toClockTime("minuit")).toBeNull();
  });
});

describe("toNextOccurrence : la première fois que l'heure sonne après un instant", () => {
  it("prend minuit suivant pour un live commencé à 21 h", () => {
    expect(toNextOccurrence(at(14, 21), { hours: 0, minutes: 0 })).toBe(at(15, 0));
  });

  it("prend le soir même quand l'heure n'est pas encore passée", () => {
    expect(toNextOccurrence(at(14, 21), { hours: 23, minutes: 30 })).toBe(at(14, 23, 30));
  });

  it("prend le lendemain quand l'heure est déjà passée, ou pile à l'instant de départ", () => {
    expect(toNextOccurrence(at(14, 21), { hours: 20, minutes: 0 })).toBe(at(15, 20));
    expect(toNextOccurrence(at(14, 21), { hours: 21, minutes: 0 })).toBe(at(15, 21));
  });

  it("prend minuit du lendemain pour un live commencé juste après minuit", () => {
    expect(toNextOccurrence(at(15, 0, 10), { hours: 0, minutes: 0 })).toBe(at(16, 0));
  });
});

describe("toHourCount : les heures pleines de diffusion", () => {
  it("compte les heures entières depuis le début", () => {
    expect(toHourCount(0, 3_599_999)).toBe(0);
    expect(toHourCount(0, HOUR_MS)).toBe(1);
    expect(toHourCount(0, 2 * HOUR_MS + 1)).toBe(2);
  });

  it("ne compte jamais en négatif", () => {
    expect(toHourCount(1000, 0)).toBe(0);
  });
});

describe("toEndStages : les avertissements, la fin, deux rappels, le coucher", () => {
  const end = at(15, 0);

  it("place un avertissement par palier avant la fin, la fin, deux rappels toutes les 10 min, puis le coucher au troisième", () => {
    expect(toEndStages(end, { warningMarks: [60, 30], overtimeGap: 600_000 })).toEqual([
      { at: at(14, 23), kind: "warning", minutes: 60 },
      { at: at(14, 23, 30), kind: "warning", minutes: 30 },
      { at: at(15, 0), kind: "end" },
      { at: at(15, 0, 10), kind: "overtime" },
      { at: at(15, 0, 20), kind: "overtime" },
      { at: at(15, 0, 30), kind: "bedtime" },
    ]);
  });

  it("suit les réglages : des paliers et un écart plus courts", () => {
    const stages = toEndStages(end, { warningMarks: [5, 1], overtimeGap: 120_000 });
    expect(stages.map(({ at: when }) => (when - end) / 60_000)).toEqual([-5, -1, 0, 2, 4, 6]);
  });

  it("n'avertit pas quand il n'y a aucun palier : la fin, les rappels et le coucher restent", () => {
    const stages = toEndStages(end, { warningMarks: [], overtimeGap: 600_000 });
    expect(stages.map(({ kind }) => kind)).toEqual(["end", "overtime", "overtime", "bedtime"]);
  });
});

describe("toStagePlan : quelle liste, quelles valeurs, tournée vers qui", () => {
  const end = at(15, 0);
  const context = (now: number) => ({ end, now });
  const warn = (minutes: number) =>
    toStagePlan({ at: end - minutes * 60_000, kind: "warning", minutes }, context(end - minutes * 60_000));

  it("prévient avec le palier en nombre, le temps restant dit et l'heure de la fin, tourné vers Fenysk", () => {
    const plan = warn(30);
    expect(plan.list).toBe("foxEndWarningPhrases");
    expect(plan.isForFenysk).toBe(true);
    expect(plan.values).toMatchObject({ minutes: 30, reste: "30 minutes", fin: "minuit" });
  });

  it("monte de ton avec les minutes qui restent : calme au-delà de 15, pressant de 15 à 3, paniqué à 2 et moins", () => {
    expect(END_SOON_MINUTES).toBe(15);
    expect(END_PANIC_MINUTES).toBe(2);
    expect([60, 30, 16].map((minutes) => warn(minutes).list)).toEqual(Array(3).fill("foxEndWarningPhrases"));
    expect([15, 10, 5, 3].map((minutes) => warn(minutes).list)).toEqual(Array(4).fill("foxEndSoonPhrases"));
    expect([2, 1].map((minutes) => warn(minutes).list)).toEqual(Array(2).fill("foxEndPanicPhrases"));
  });

  it("dit le temps restant comme une durée : « 1 heure », « 1 heure 30 », « 30 minutes », « 1 minute »", () => {
    expect(warn(60).values.reste).toBe("1 heure");
    expect(warn(90).values.reste).toBe("1 heure 30");
    expect(warn(120).values.reste).toBe("2 heures");
    expect(warn(30).values.reste).toBe("30 minutes");
    expect(warn(2).values.reste).toBe("2 minutes");
    expect(warn(1).values.reste).toBe("1 minute");
    expect(warn(1).values.minutes).toBe(1);
  });

  it("ne donne le palier et le temps restant qu'aux avertissements", () => {
    const plan = toStagePlan({ at: end, kind: "end" }, context(end));
    expect(plan.values).not.toHaveProperty("minutes");
    expect(plan.values).not.toHaveProperty("reste");
  });

  it("annonce la fin avec l'heure dite à la française", () => {
    const plan = toStagePlan({ at: end, kind: "end" }, context(end));
    expect(plan.list).toBe("foxEndPhrases");
    expect(plan.isForFenysk).toBe(true);
    expect(plan.values).toMatchObject({ fin: "minuit", maintenant: "minuit" });
  });

  it("rappelle avec l'heure de la fin, l'heure qu'il est et le retard", () => {
    const plan = toStagePlan({ at: at(15, 0, 20), kind: "overtime" }, context(at(15, 0, 20)));
    expect(plan.list).toBe("foxOvertimePhrases");
    expect(plan.isForFenysk).toBe(true);
    expect(plan.values).toMatchObject({ fin: "minuit", maintenant: "minuit 20", retard: "20 minutes" });
  });

  it("dit le retard en heures et minutes au-delà d'une heure", () => {
    const plan = toStagePlan({ at: at(15, 1, 10), kind: "overtime" }, context(at(15, 1, 10)));
    expect(plan.values).toMatchObject({ maintenant: "1 heure 10", retard: "1 heure 10" });
  });

  it("arrondit le retard à la minute près : un pas en retard de quelques ms n'y change rien", () => {
    const plan = toStagePlan({ at: at(15, 0, 10), kind: "overtime" }, context(at(15, 0, 10, 0) + 150));
    expect(plan.values).toMatchObject({ retard: "10 minutes" });
  });

  it("couche le renard avec la liste du coucher, tournée vers Fenysk", () => {
    const plan = toStagePlan({ at: at(15, 0, 30), kind: "bedtime" }, context(at(15, 0, 30)));
    expect(plan.list).toBe("foxBedtimePhrases");
    expect(plan.isForFenysk).toBe(true);
  });
});

describe("toHourPlan : une heure pleine de diffusion", () => {
  it("dit « 1 heure », « 2 heures », tourné vers le tchat", () => {
    expect(toHourPlan(1)).toEqual({
      list: "foxHourPhrases",
      values: { heures: "1 heure" },
      isForFenysk: false,
    });
    expect(toHourPlan(2).values).toEqual({ heures: "2 heures" });
  });
});

describe("toEndStatus : la fin prévue vue d'un instant", () => {
  it("n'a pas de fin quand le réglage est vide ou n'est pas une heure", () => {
    expect(toEndStatus("", at(14, 21))).toEqual({ kind: "none" });
    expect(toEndStatus("minuit", at(14, 21))).toEqual({ kind: "none" });
  });

  it("annonce la fin du soir à venir, avec le temps qui reste", () => {
    expect(toEndStatus("23:00", at(14, 21, 48))).toEqual({
      kind: "upcoming",
      end: at(14, 23),
      remaining: 72 * 60_000,
    });
  });

  it("annonce la fin du soir suivant quand elle a sonné il y a plus de 3 h : à 11 h 30, pour 23 h", () => {
    expect(toEndStatus("23:00", at(15, 11, 30))).toEqual({
      kind: "upcoming",
      end: at(15, 23),
      remaining: (11 * 60 + 30) * 60_000,
    });
  });

  it("annonce une fin lointaine du matin pour le soir ou la nuit : à 10 h, 23 h est à 13 h et 02 h à 16 h", () => {
    expect(toEndStatus("23:00", at(14, 10))).toEqual({
      kind: "upcoming",
      end: at(14, 23),
      remaining: 13 * 3_600_000,
    });
    expect(toEndStatus("02:00", at(14, 10))).toEqual({
      kind: "upcoming",
      end: at(15, 2),
      remaining: 16 * 3_600_000,
    });
  });

  it("dit la fin dépassée quand elle a sonné il y a moins de 3 h, de combien de temps", () => {
    expect(toEndStatus("23:00", at(14, 23, 5))).toEqual({
      kind: "overtime",
      end: at(14, 23),
      elapsed: 5 * 60_000,
    });
  });

  it("passe minuit : à 0 h 20, la fin de 23 h est celle d'hier soir, dépassée de 1 h 20", () => {
    expect(toEndStatus("23:00", at(15, 0, 20))).toEqual({
      kind: "overtime",
      end: at(14, 23),
      elapsed: 80 * 60_000,
    });
  });

  it("passe minuit dans l'autre sens : à 23 h 50, la fin de 00:30 est à venir dans 40 min", () => {
    expect(toEndStatus("00:30", at(14, 23, 50))).toEqual({
      kind: "upcoming",
      end: at(15, 0, 30),
      remaining: 40 * 60_000,
    });
  });

  it("tient la limite : dépassée à 3 h moins une seconde, à venir à 3 h pile avec 21 h devant", () => {
    expect(toEndStatus("23:00", at(15, 1, 59, 59)).kind).toBe("overtime");
    expect(toEndStatus("23:00", at(15, 2))).toEqual({
      kind: "upcoming",
      end: at(15, 23),
      remaining: 21 * 3_600_000,
    });
  });

  it("dit la fin dépassée de zéro à l'instant même où elle sonne", () => {
    expect(toEndStatus("23:00", at(14, 23))).toEqual({ kind: "overtime", end: at(14, 23), elapsed: 0 });
  });
});

describe("toSteppedEndTime : un cran de dix minutes sur la fin prévue", () => {
  const later = (endTime: string, now: number) => toSteppedEndTime(endTime, now, "later");
  const sooner = (endTime: string, now: number) => toSteppedEndTime(endTime, now, "sooner");

  it("pose la fin à la dizaine de minutes qui suit maintenant quand il n'y en a pas : 21:47 donne 21:50", () => {
    expect(later("", at(14, 21, 47))).toBe("21:50");
    expect(later("", at(14, 21, 49, 59))).toBe("21:50");
  });

  it("passe à la dizaine d'après quand maintenant tombe pile sur une dizaine : 21:50:00 donne 22:00", () => {
    expect(later("", at(14, 21, 50))).toBe("22:00");
    expect(later("", at(14, 21, 50, 1))).toBe("22:00");
    expect(later("", at(14, 21, 0))).toBe("21:10");
  });

  it("repousse une fin sur une dizaine pile à la suivante, et la ramène à la précédente : 23:00 donne 23:10 et 22:50", () => {
    expect(later("23:00", at(14, 21, 47))).toBe("23:10");
    expect(sooner("23:00", at(14, 21, 47))).toBe("22:50");
  });

  it("range une heure tapée à la main sur la dizaine suivante ou précédente : 23:05 donne 23:10 et 23:00", () => {
    expect(later("23:05", at(14, 21, 47))).toBe("23:10");
    expect(sooner("23:05", at(14, 21, 47))).toBe("23:00");
    expect(later("23:59", at(14, 21, 47))).toBe("00:00");
    expect(sooner("23:51", at(14, 21, 47))).toBe("23:50");
  });

  it("ne repousse jamais avant la dizaine qui suit maintenant : une fin dépassée de 23:00 à 23:25 donne 23:30", () => {
    expect(later("23:00", at(14, 23, 25))).toBe("23:30");
    expect(later("23:00", at(14, 23, 30))).toBe("23:40");
    expect(later("23:00", at(14, 23, 0))).toBe("23:10");
  });

  it("repousse une fin proche au-delà d'elle : à 21:47 pour 21:50, le cran donne 22:00", () => {
    expect(later("21:50", at(14, 21, 47))).toBe("22:00");
  });

  it("garde une fin à venir quand le cran arrière la laisse après maintenant, et l'efface sinon", () => {
    expect(sooner("22:00", at(14, 21, 47))).toBe("21:50");
    expect(sooner("21:55", at(14, 21, 47))).toBe("21:50");
    expect(sooner("21:50", at(14, 21, 47))).toBe("");
    expect(sooner("21:50", at(14, 21, 50))).toBe("");
  });

  it("efface la fin quand le cran arrière tombe sur maintenant ou avant, fin dépassée comprise", () => {
    expect(sooner("22:00", at(14, 21, 50))).toBe("");
    expect(sooner("23:00", at(14, 23, 25))).toBe("");
    expect(sooner("21:50", at(14, 21, 47))).toBe("");
  });

  it("ne change rien en arrière sans fin prévue", () => {
    expect(sooner("", at(14, 21, 47))).toBe("");
  });

  it("traverse minuit dans les deux sens : 23:50 donne 00:00, et 00:00 donne 23:50", () => {
    expect(later("23:50", at(14, 21, 47))).toBe("00:00");
    expect(sooner("00:00", at(14, 21, 47))).toBe("23:50");
    expect(later("", at(14, 23, 55))).toBe("00:00");
    expect(sooner("00:10", at(14, 23, 40))).toBe("00:00");
  });

  it("reste cohérent minuit passé : à 00:03, une fin de 23:50 dépassée donne 00:10 en avant et rien en arrière", () => {
    expect(later("23:50", at(15, 0, 3))).toBe("00:10");
    expect(sooner("23:50", at(15, 0, 3))).toBe("");
  });

  it("ne dépasse pas maintenant + 21 h : au-delà, le cran ne change rien", () => {
    expect(later("18:30", at(14, 21, 47))).toBe("18:40");
    expect(later("18:40", at(14, 21, 47))).toBe("18:40");
  });

  it("lit une heure sonnée il y a moins de 3 h comme dépassée, donc le cran va à la dizaine qui suit maintenant : 19:50 à 21:47 donne 21:50", () => {
    expect(later("19:50", at(14, 21, 47))).toBe("21:50");
  });

  it("tient le plafond à la seconde : 21 h pile passe, une seconde de plus non", () => {
    expect(later("18:40", at(14, 21, 50))).toBe("18:50");
    expect(later("18:40", at(14, 21, 49, 59))).toBe("18:40");
  });

  // Les crans successifs depuis rien, jusqu'à ce que la fin ne bouge plus.
  const walk = (now: number): string[] => {
    const values: string[] = [];
    let value = "";
    for (let step = 0; step < 300; step += 1) {
      const next = later(value, now);
      if (next === value) break;
      value = next;
      values.push(value);
    }
    return values;
  };

  it("monte jusqu'à 21 h devant et s'arrête : à 02:56, la dernière fin atteignable est 23:50", () => {
    const values = walk(at(15, 2, 56));
    expect(values.at(0)).toBe("03:00");
    expect(values.at(-1)).toBe("23:50");
    expect(values).toContain("14:50");
    expect(values).toHaveLength(126);
    expect(later("23:50", at(15, 2, 56))).toBe("23:50");
  });

  it("atteint le soir et la nuit depuis le matin : à 10:00, 23:00 (13 h devant) et 02:00 (16 h devant) sont atteignables", () => {
    const values = walk(at(14, 10));
    expect(values.at(0)).toBe("10:10");
    expect(values).toContain("23:00");
    expect(values).toContain("02:00");
    expect(values.at(-1)).toBe("07:00");
  });

  it("repart du texte reçu quand il n'est pas une heure : en avant comme sans fin, en arrière rien", () => {
    expect(later("minuit", at(14, 21, 47))).toBe("21:50");
    expect(sooner("minuit", at(14, 21, 47))).toBe("minuit");
  });

  it("écrit toujours HH:MM sur deux chiffres", () => {
    expect(later("", at(14, 8, 3))).toBe("08:10");
    expect(later("", at(14, 0, 3))).toBe("00:10");
  });
});

describe("toLateFrom : après quoi il bâille", () => {
  it("prend la fin prévue quand il y en a une", () => {
    expect(toLateFrom(at(14, 21), at(15, 0), "23:30")).toBe(at(15, 0));
  });

  it("prend 23 h 30 sans fin prévue, la première fois après le début de la diffusion", () => {
    expect(toLateFrom(at(14, 21), null, "23:30")).toBe(at(14, 23, 30));
    expect(toLateFrom(at(14, 23, 45), null, "23:30")).toBe(at(15, 23, 30));
  });

  it("n'a pas d'heure quand le réglage n'en est pas une", () => {
    expect(toLateFrom(at(14, 21), null, "tard")).toBeNull();
  });
});

describe("toLateYawnDelay : 5 à 10 min au hasard", () => {
  const rules = { lateYawnMin: 300_000, lateYawnMax: 600_000 };

  it("va du minimum au maximum selon le tirage", () => {
    expect(toLateYawnDelay(rules, () => 0)).toBe(300_000);
    expect(toLateYawnDelay(rules, () => 0.5)).toBe(450_000);
    expect(toLateYawnDelay(rules, () => 0.999)).toBeLessThanOrEqual(600_000);
  });
});
