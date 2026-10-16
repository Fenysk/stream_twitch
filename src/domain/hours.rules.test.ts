import { describe, expect, it } from "vitest";
import {
  END_PANIC_MINUTES,
  END_SOON_MINUTES,
  HOUR_MS,
  type HoursRules,
  isEndOver,
  OVERTIME_SPAN_MS,
  toClockText,
  toClockTime,
  toEndClock,
  toEndStages,
  toEndStatus,
  toHourCount,
  toHourPlan,
  toHoursRules,
  toLateFrom,
  toLateYawnDelay,
  toLegacyEndAt,
  toNextOccurrence,
  toStagePlan,
  toSteppedEndAt,
  toTypedEndAt,
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
    foxEndAt: new Date(at(15, 0)).toISOString(),
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
      endAt: at(15, 0),
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

  it("lit la fin prévue avec sa date, et n'en a pas quand le réglage est vide", () => {
    expect(toHoursRules({ ...settings, foxEndAt: "2026-10-16T13:00:00.000Z" })?.endAt).toBe(
      Date.UTC(2026, 9, 16, 13),
    );
    expect(toHoursRules({ ...settings, foxEndAt: "" })?.endAt).toBeNull();
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
  const end = at(14, 23);

  it("n'a pas de fin quand il n'y a pas d'instant", () => {
    expect(toEndStatus(null, at(14, 21))).toEqual({ kind: "none" });
  });

  it("annonce la fin à venir, avec le temps qui reste", () => {
    expect(toEndStatus(end, at(14, 21, 48))).toEqual({ kind: "upcoming", end, remaining: 72 * 60_000 });
  });

  it("annonce une fin du lendemain à venir, avec toutes ses heures devant : à 21 h 48, 23 h du lendemain est à 25 h 12", () => {
    expect(toEndStatus(at(15, 23), at(14, 21, 48))).toEqual({
      kind: "upcoming",
      end: at(15, 23),
      remaining: (25 * 60 + 12) * 60_000,
    });
  });

  it("dit la fin dépassée dès qu'elle a sonné, de combien de temps", () => {
    expect(toEndStatus(end, at(14, 23, 5))).toEqual({ kind: "overtime", end, elapsed: 5 * 60_000 });
  });

  it("la dit dépassée tant qu'elle n'est pas effacée, même 5 h 40 après : plus de fenêtre de 3 h pour l'affichage", () => {
    expect(toEndStatus(end, at(15, 4, 40))).toEqual({
      kind: "overtime",
      end,
      elapsed: (5 * 60 + 40) * 60_000,
    });
  });

  it("passe minuit : à 0 h 20, la fin de 23 h est celle d'hier soir, dépassée de 1 h 20", () => {
    expect(toEndStatus(at(14, 23), at(15, 0, 20))).toEqual({
      kind: "overtime",
      end: at(14, 23),
      elapsed: 80 * 60_000,
    });
  });

  it("passe minuit dans l'autre sens : à 23 h 50, la fin de 00:30 est à venir dans 40 min", () => {
    expect(toEndStatus(at(15, 0, 30), at(14, 23, 50))).toEqual({
      kind: "upcoming",
      end: at(15, 0, 30),
      remaining: 40 * 60_000,
    });
  });

  it("dit la fin dépassée de zéro à l'instant même où elle sonne, à venir une milliseconde avant", () => {
    expect(toEndStatus(end, end)).toEqual({ kind: "overtime", end, elapsed: 0 });
    expect(toEndStatus(end, end - 1)).toEqual({ kind: "upcoming", end, remaining: 1 });
  });
});

describe("toLegacyEndAt : l'ancienne fin « HH:MM » d'un settings.local.json devenue un instant", () => {
  it("prend celle d'aujourd'hui quand elle n'a pas encore sonné : « 15:00 » à 14 h", () => {
    expect(toLegacyEndAt("15:00", at(14, 14))).toBe(at(14, 15));
  });

  it("prend celle d'aujourd'hui, dépassée, quand elle a sonné il y a moins de 3 h : « 15:00 » à 16 h", () => {
    expect(toLegacyEndAt("15:00", at(14, 16))).toBe(at(14, 15));
    expect(toLegacyEndAt("15:00", at(14, 17, 59, 59))).toBe(at(14, 15));
  });

  it("prend la prochaine quand elle a sonné il y a 3 h ou plus : « 15:00 » à 19 h donne demain", () => {
    expect(toLegacyEndAt("15:00", at(14, 19))).toBe(at(15, 15));
    expect(toLegacyEndAt("15:00", at(14, 18))).toBe(at(15, 15));
  });

  it("passe minuit : « 23:00 » à 0 h 20 est celle d'hier soir, « 00:30 » à 23 h 50 celle de la nuit qui vient", () => {
    expect(toLegacyEndAt("23:00", at(15, 0, 20))).toBe(at(14, 23));
    expect(toLegacyEndAt("00:30", at(14, 23, 50))).toBe(at(15, 0, 30));
  });

  it("n'a pas de fin pour un texte vide ou qui n'est pas une heure", () => {
    expect(toLegacyEndAt("", at(14, 14))).toBeNull();
    expect(toLegacyEndAt("24:00", at(14, 14))).toBeNull();
    expect(toLegacyEndAt("minuit", at(14, 14))).toBeNull();
  });

  it("garde la règle que la page Direct appliquait à l'ancien réglage : dépassée jusqu'à 3 h, à venir ensuite", () => {
    expect(OVERTIME_SPAN_MS).toBe(3 * HOUR_MS);
    expect(toEndStatus(toLegacyEndAt("23:00", at(15, 1, 59, 59)), at(15, 1, 59, 59)).kind).toBe("overtime");
    expect(toEndStatus(toLegacyEndAt("23:00", at(15, 2)), at(15, 2))).toEqual({
      kind: "upcoming",
      end: at(15, 23),
      remaining: 21 * HOUR_MS,
    });
  });
});

describe("toTypedEndAt : l'heure tapée dans le champ de la fin prévue", () => {
  it("donne la prochaine fois que l'heure sonne : « 15:00 » tapé à 14 h est aujourd'hui, à 16 h demain", () => {
    expect(toTypedEndAt("15:00", at(14, 14))).toBe(at(14, 15));
    expect(toTypedEndAt("15:00", at(14, 16))).toBe(at(15, 15));
  });

  it("donne le lendemain pile à l'heure tapée : strictement après maintenant", () => {
    expect(toTypedEndAt("15:00", at(14, 15))).toBe(at(15, 15));
    expect(toTypedEndAt("15:00", at(14, 14, 59, 59))).toBe(at(14, 15));
  });

  it("passe minuit : « 00:30 » tapé à 23 h 50 est dans 40 min", () => {
    expect(toTypedEndAt("00:30", at(14, 23, 50))).toBe(at(15, 0, 30));
  });

  it("refuse ce qui n'est pas HH:MM de 00:00 à 23:59, le texte vide compris", () => {
    for (const typed of ["", "24:00", "9:30", "15h", "minuit", " 15:00", "15:00:00"]) {
      expect(toTypedEndAt(typed, at(14, 14)), typed).toBeNull();
    }
  });
});

describe("toEndClock et toClockText : l'heure locale d'un instant", () => {
  it("écrit HH:MM sur deux chiffres pour le champ et les touches, le texte vide sans fin", () => {
    expect(toEndClock(at(14, 23))).toBe("23:00");
    expect(toEndClock(at(15, 8, 5))).toBe("08:05");
    expect(toEndClock(at(15, 0))).toBe("00:00");
    expect(toEndClock(null)).toBe("");
  });

  it("écrit « 23 h 00 » dans une phrase, sans zéro devant les heures", () => {
    expect(toClockText(at(14, 23))).toBe("23 h 00");
    expect(toClockText(at(14, 9, 5))).toBe("9 h 05");
    expect(toClockText(at(15, 0))).toBe("0 h 00");
  });
});

describe("toSteppedEndAt : un cran de dix minutes sur la fin prévue", () => {
  const later = (endAt: number | null, now: number) => toSteppedEndAt(endAt, now, "later");
  const sooner = (endAt: number | null, now: number) => toSteppedEndAt(endAt, now, "sooner");
  const clock = (endAt: number | null) => toEndClock(endAt);

  it("pose la fin à la dizaine de minutes qui suit maintenant quand il n'y en a pas : 21:47 donne 21:50", () => {
    expect(later(null, at(14, 21, 47))).toBe(at(14, 21, 50));
    expect(later(null, at(14, 21, 49, 59))).toBe(at(14, 21, 50));
  });

  it("passe à la dizaine d'après quand maintenant tombe pile sur une dizaine : 21:50:00 donne 22:00", () => {
    expect(later(null, at(14, 21, 50))).toBe(at(14, 22));
    expect(later(null, at(14, 21, 50, 1))).toBe(at(14, 22));
    expect(later(null, at(14, 21, 0))).toBe(at(14, 21, 10));
  });

  it("repousse une fin sur une dizaine pile à la suivante, et la ramène à la précédente : 23:00 donne 23:10 et 22:50", () => {
    expect(later(at(14, 23), at(14, 21, 47))).toBe(at(14, 23, 10));
    expect(sooner(at(14, 23), at(14, 21, 47))).toBe(at(14, 22, 50));
  });

  it("range une fin posée à la main sur la dizaine suivante ou précédente : 23:05 donne 23:10 et 23:00", () => {
    expect(later(at(14, 23, 5), at(14, 21, 47))).toBe(at(14, 23, 10));
    expect(sooner(at(14, 23, 5), at(14, 21, 47))).toBe(at(14, 23));
    expect(later(at(14, 23, 59), at(14, 21, 47))).toBe(at(15, 0));
    expect(sooner(at(14, 23, 51), at(14, 21, 47))).toBe(at(14, 23, 50));
  });

  it("ne repousse jamais avant la dizaine qui suit maintenant : une fin dépassée de 23:00 à 23:25 donne 23:30", () => {
    expect(later(at(14, 23), at(14, 23, 25))).toBe(at(14, 23, 30));
    expect(later(at(14, 23), at(14, 23, 30))).toBe(at(14, 23, 40));
    expect(later(at(14, 23), at(14, 23, 0))).toBe(at(14, 23, 10));
  });

  it("repousse une fin proche au-delà d'elle : à 21:47 pour 21:50, le cran donne 22:00", () => {
    expect(later(at(14, 21, 50), at(14, 21, 47))).toBe(at(14, 22));
  });

  it("garde une fin à venir quand le cran arrière la laisse après maintenant, et l'efface sinon", () => {
    expect(sooner(at(14, 22), at(14, 21, 47))).toBe(at(14, 21, 50));
    expect(sooner(at(14, 21, 55), at(14, 21, 47))).toBe(at(14, 21, 50));
    expect(sooner(at(14, 21, 50), at(14, 21, 47))).toBeNull();
    expect(sooner(at(14, 21, 50), at(14, 21, 50))).toBeNull();
  });

  it("efface la fin quand le cran arrière tombe sur maintenant ou avant, fin dépassée comprise", () => {
    expect(sooner(at(14, 22), at(14, 21, 50))).toBeNull();
    expect(sooner(at(14, 23), at(14, 23, 25))).toBeNull();
    expect(sooner(at(14, 21, 50), at(14, 21, 47))).toBeNull();
  });

  it("ne change rien en arrière sans fin prévue", () => {
    expect(sooner(null, at(14, 21, 47))).toBeNull();
  });

  it("traverse minuit dans les deux sens : 23:50 donne 00:00, et 00:00 donne 23:50", () => {
    expect(later(at(14, 23, 50), at(14, 21, 47))).toBe(at(15, 0));
    expect(sooner(at(15, 0), at(14, 21, 47))).toBe(at(14, 23, 50));
    expect(later(null, at(14, 23, 55))).toBe(at(15, 0));
    expect(sooner(at(15, 0, 10), at(14, 23, 40))).toBe(at(15, 0));
  });

  it("reste cohérent minuit passé : à 00:03, une fin de 23:50 dépassée donne 00:10 en avant et rien en arrière", () => {
    expect(later(at(14, 23, 50), at(15, 0, 3))).toBe(at(15, 0, 10));
    expect(sooner(at(14, 23, 50), at(15, 0, 3))).toBeNull();
  });

  it("ne dépasse pas maintenant + 24 h : au-delà, le cran ne change rien", () => {
    expect(later(at(15, 21, 30), at(14, 21, 47))).toBe(at(15, 21, 40));
    expect(later(at(15, 21, 40), at(14, 21, 47))).toBe(at(15, 21, 40));
  });

  it("n'efface pas parce que la fin est lointaine, et la ramène de 24 h : -10 sur une fin à maintenant + 24 h", () => {
    expect(sooner(at(15, 21, 40), at(14, 21, 47))).toBe(at(15, 21, 30));
  });

  it("tient le plafond à la seconde : 24 h pile passe, une seconde de plus non", () => {
    expect(later(at(15, 21, 40), at(14, 21, 50))).toBe(at(15, 21, 50));
    expect(later(at(15, 21, 40), at(14, 21, 49, 59))).toBe(at(15, 21, 40));
  });

  // Les crans successifs depuis rien, jusqu'à ce que la fin ne bouge plus.
  const walk = (now: number): number[] => {
    const values: number[] = [];
    let value: number | null = null;
    for (let step = 0; step < 300; step += 1) {
      const next = later(value, now);
      if (next === value || next === null) break;
      value = next;
      values.push(value);
    }
    return values;
  };

  it("monte jusqu'à 24 h devant et s'arrête : à 02:56, la dernière fin atteignable est 02:50 le lendemain", () => {
    const values = walk(at(15, 2, 56));
    expect(clock(values.at(0) ?? null)).toBe("03:00");
    expect(values.at(-1)).toBe(at(16, 2, 50));
    expect(values).toContain(at(15, 14, 50));
    expect(values).toHaveLength(144);
    expect(later(at(16, 2, 50), at(15, 2, 56))).toBe(at(16, 2, 50));
  });

  it("atteint le soir et la nuit depuis le matin, et le lendemain matin : à 10:00, 23:00 et 02:00 sont atteignables jusqu'à 10:00 demain", () => {
    const values = walk(at(14, 10));
    expect(clock(values.at(0) ?? null)).toBe("10:10");
    expect(values).toContain(at(14, 23));
    expect(values).toContain(at(15, 2));
    expect(values.at(-1)).toBe(at(15, 10));
  });

  it("repart de rien quand il n'y a pas d'instant : en avant comme sans fin, en arrière rien", () => {
    expect(later(null, at(14, 21, 47))).toBe(at(14, 21, 50));
    expect(sooner(null, at(14, 21, 47))).toBeNull();
  });

  it("écrit toujours HH:MM sur deux chiffres", () => {
    expect(clock(later(null, at(14, 8, 3)))).toBe("08:10");
    expect(clock(later(null, at(14, 0, 3)))).toBe("00:10");
  });
});

describe("isEndOver : quand la fin enregistrée s'efface", () => {
  const end = at(14, 15);

  it("à l'arrêt du live : si elle est passée, ou pile maintenant", () => {
    expect(isEndOver(end, at(14, 15, 20), { kind: "stopped" })).toBe(true);
    expect(isEndOver(end, end, { kind: "stopped" })).toBe(true);
  });

  it("à l'arrêt du live : pas si elle est encore à venir, un live coupé avant l'heure de fin la garde", () => {
    expect(isEndOver(end, at(14, 14, 30), { kind: "stopped" })).toBe(false);
  });

  it("hors live : 3 h après elle, pas une seconde avant", () => {
    expect(isEndOver(end, end + OVERTIME_SPAN_MS - 1, { kind: "idle" })).toBe(false);
    expect(isEndOver(end, end + OVERTIME_SPAN_MS, { kind: "idle" })).toBe(true);
    expect(isEndOver(end, at(14, 18), { kind: "idle" })).toBe(true);
  });

  it("hors live : jamais avant l'heure de fin", () => {
    expect(isEndOver(end, at(14, 10), { kind: "idle" })).toBe(false);
    expect(isEndOver(end, at(14, 15, 20), { kind: "idle" })).toBe(false);
  });

  it("pendant un live commencé avant elle : jamais, même bien au-delà de fin + 3 h", () => {
    const live = { kind: "live", startedAt: at(14, 11, 43) } as const;
    expect(isEndOver(end, at(14, 14), live)).toBe(false);
    expect(isEndOver(end, at(14, 15, 10), live)).toBe(false);
    expect(isEndOver(end, at(14, 18), live)).toBe(false);
    expect(isEndOver(end, at(14, 23), live)).toBe(false);
  });

  it("pendant un live commencé après elle (OBS fermé en plein live) : tout de suite", () => {
    expect(isEndOver(end, at(14, 16), { kind: "live", startedAt: at(14, 16) })).toBe(true);
    expect(isEndOver(end, at(14, 16, 30), { kind: "live", startedAt: at(14, 16) })).toBe(true);
  });

  it("pendant un live commencé pile à l'heure de fin : elle n'a plus de sens, elle s'efface; une seconde avant, elle reste", () => {
    expect(isEndOver(end, end, { kind: "live", startedAt: end })).toBe(true);
    expect(isEndOver(end, end, { kind: "live", startedAt: end - 1000 })).toBe(false);
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
