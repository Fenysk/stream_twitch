import { describe, expect, it } from "vitest";
import {
  toCapitalized,
  toSpokenClock,
  toSpokenDuration,
  toSpokenHours,
  toSpokenTime,
} from "./spoken-time.rules";

describe("toSpokenTime : l'heure du jour à la française", () => {
  it("dit minuit et midi par leur nom", () => {
    expect(toSpokenTime(0, 0)).toBe("minuit");
    expect(toSpokenTime(12, 0)).toBe("midi");
  });

  it("ajoute les minutes après minuit et midi", () => {
    expect(toSpokenTime(0, 20)).toBe("minuit 20");
    expect(toSpokenTime(12, 5)).toBe("midi 5");
  });

  it("dit les autres heures en heures, au singulier pour 1 heure", () => {
    expect(toSpokenTime(23, 0)).toBe("23 heures");
    expect(toSpokenTime(1, 0)).toBe("1 heure");
    expect(toSpokenTime(20, 0)).toBe("20 heures");
  });

  it("ajoute les minutes après l'heure, sans zéro devant", () => {
    expect(toSpokenTime(23, 30)).toBe("23 heures 30");
    expect(toSpokenTime(1, 10)).toBe("1 heure 10");
    expect(toSpokenTime(7, 5)).toBe("7 heures 5");
  });
});

describe("toSpokenHours", () => {
  it("accorde heure au pluriel dès 2", () => {
    expect(toSpokenHours(1)).toBe("1 heure");
    expect(toSpokenHours(2)).toBe("2 heures");
    expect(toSpokenHours(10)).toBe("10 heures");
  });
});

describe("toSpokenDuration : un retard en minutes", () => {
  it("dit les durées sous l'heure en minutes", () => {
    expect(toSpokenDuration(20)).toBe("20 minutes");
    expect(toSpokenDuration(1)).toBe("1 minute");
    expect(toSpokenDuration(59)).toBe("59 minutes");
  });

  it("dit les heures, puis les minutes restantes", () => {
    expect(toSpokenDuration(60)).toBe("1 heure");
    expect(toSpokenDuration(70)).toBe("1 heure 10");
    expect(toSpokenDuration(125)).toBe("2 heures 5");
  });
});

describe("toSpokenClock : l'heure locale d'un instant", () => {
  it("lit l'heure et les minutes locales", () => {
    expect(toSpokenClock(new Date(2026, 9, 14, 23, 30).getTime())).toBe("23 heures 30");
    expect(toSpokenClock(new Date(2026, 9, 15, 0, 0).getTime())).toBe("minuit");
    expect(toSpokenClock(new Date(2026, 9, 15, 0, 20).getTime())).toBe("minuit 20");
    expect(toSpokenClock(new Date(2026, 9, 15, 12, 0).getTime())).toBe("midi");
  });
});

describe("toCapitalized", () => {
  it("met la première lettre en majuscule, accentuée comprise", () => {
    expect(toCapitalized("minuit. Le live est fini")).toBe("Minuit. Le live est fini");
    expect(toCapitalized("élan")).toBe("Élan");
  });

  it("laisse un chiffre ou un texte vide tels quels", () => {
    expect(toCapitalized("23 heures")).toBe("23 heures");
    expect(toCapitalized("")).toBe("");
  });
});
