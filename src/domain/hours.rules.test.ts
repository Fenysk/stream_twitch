import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  type HoursRules,
  toClockTime,
  toEndStages,
  toHourCount,
  toHourPlan,
  toHoursRules,
  toLateFrom,
  toLateYawnDelay,
  toNextOccurrence,
  toStagePlan,
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
    foxEndWarning: 1_800_000,
    foxEndWarningPhrases: ["W"],
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
      warning: 1_800_000,
      overtimeGap: 600_000,
      lateAfter: "23:30",
      lateYawnMin: 300_000,
      lateYawnMax: 600_000,
      phrases: {
        foxHourPhrases: ["H"],
        foxEndWarningPhrases: ["W"],
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

describe("toEndStages : l'avertissement, la fin, deux rappels, le coucher", () => {
  const end = at(15, 0);

  it("place l'avertissement 30 min avant, la fin, deux rappels toutes les 10 min, puis le coucher au troisième", () => {
    expect(toEndStages(end, { warning: 1_800_000, overtimeGap: 600_000 })).toEqual([
      { at: at(14, 23, 30), kind: "warning" },
      { at: at(15, 0), kind: "end" },
      { at: at(15, 0, 10), kind: "overtime" },
      { at: at(15, 0, 20), kind: "overtime" },
      { at: at(15, 0, 30), kind: "bedtime" },
    ]);
  });

  it("suit les réglages : un avertissement et un écart plus courts", () => {
    const stages = toEndStages(end, { warning: 300_000, overtimeGap: 120_000 });
    expect(stages.map(({ at: when }) => (when - end) / 60_000)).toEqual([-5, 0, 2, 4, 6]);
  });
});

describe("toStagePlan : quelle liste, quelles valeurs, tournée vers qui", () => {
  const end = at(15, 0);
  const context = (now: number) => ({ end, now, warning: 1_800_000 });

  it("prévient avec le nombre de minutes et l'heure de la fin, tourné vers Fenysk", () => {
    const plan = toStagePlan({ at: at(14, 23, 30), kind: "warning" }, context(at(14, 23, 30)));
    expect(plan.list).toBe("foxEndWarningPhrases");
    expect(plan.isForFenysk).toBe(true);
    expect(plan.values).toMatchObject({ minutes: 30, fin: "minuit" });
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
