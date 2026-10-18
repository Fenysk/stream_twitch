import { describe, expect, it } from "vitest";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import {
  toClipDateText,
  toConfirmedText,
  toDayText,
  toDurationText,
  toLaughRankText,
  toShowStatusText,
  toTimecodeText,
} from "./clip-text";

describe("toDurationText", () => {
  it("écrit les minutes et les secondes, arrondies à la seconde", () => {
    expect(toDurationText(118.55)).toBe("1:59");
    expect(toDurationText(118.4)).toBe("1:58");
    expect(toDurationText(5)).toBe("0:05");
    expect(toDurationText(0)).toBe("0:00");
  });

  it("ajoute les heures à partir d'une heure", () => {
    expect(toDurationText(3723)).toBe("1:02:03");
  });

  it("dit qu'une durée est inconnue quand ffprobe ne l'a pas lue", () => {
    expect(toDurationText(null)).toBe("durée inconnue");
  });
});

describe("toTimecodeText", () => {
  it("écrit un instant au centième de seconde", () => {
    expect(toTimecodeText(12.5)).toBe("0:12.50");
    expect(toTimecodeText(118.55)).toBe("1:58.55");
    expect(toTimecodeText(0)).toBe("0:00.00");
    expect(toTimecodeText(59.999)).toBe("1:00.00");
  });
});

describe("toLaughRankText", () => {
  it("dit le rang du rire choisi parmi tous les rires, et son instant au centième de seconde", () => {
    expect(toLaughRankText(2, 3, 12.5)).toBe("Rire 2 sur 3 · à 0:12.50");
    expect(toLaughRankText(1, 1, 118.55)).toBe("Rire 1 sur 1 · à 1:58.55");
  });
});

describe("toClipDateText", () => {
  it("écrit la date et l'heure de la sauvegarde, en français", () => {
    expect(toClipDateText(Date.UTC(2026, 9, 15, 15, 9, 5), "UTC")).toBe("15 oct. 2026, 15:09");
  });
});

describe("toConfirmedText", () => {
  it("accorde le nombre de clips confirmés", () => {
    expect(toConfirmedText(0)).toBe("Aucun clip confirmé.");
    expect(toConfirmedText(1)).toBe("1 clip confirmé.");
    expect(toConfirmedText(3)).toBe("3 clips confirmés.");
  });
});

describe("toDayText", () => {
  const now = Date.UTC(2026, 9, 20, 12);

  it("écrit le jour et le mois en français, sans l'année de l'année en cours", () => {
    expect(toDayText("2026-10-16", now)).toBe("16 octobre");
    expect(toDayText("2026-01-05", now)).toBe("5 janvier");
  });

  it("ajoute l'année quand ce n'est pas celle en cours", () => {
    expect(toDayText("2025-10-16", now)).toBe("16 octobre 2025");
  });

  it("dit tel quel un jour qu'il ne comprend pas", () => {
    expect(toDayText("hier", now)).toBe("hier");
  });
});

describe("toShowStatusText", () => {
  const lineup = [1, 2, 3, 4, 5].map((number) => ({
    name: `${number}.mp4`,
    title: `Clip ${number}`,
    version: "1-1",
    day: "2026-10-16",
    laughs: [],
  }));
  const running = (phase: ShowState["phase"], index: number): ShowState => ({
    status: "running",
    runId: "run1",
    lineup,
    phase,
    index,
    startsAt: 0,
    clipFader: 100,
  });

  it("dit que l'émission est arrêtée", () => {
    expect(toShowStatusText(IDLE_SHOW)).toBe("Émission arrêtée.");
  });

  it("dit le clip en cours, pendant son carton comme pendant sa lecture : « clip 2 sur 5 »", () => {
    expect(toShowStatusText(running("card", 1))).toBe("Émission en cours : clip 2 sur 5.");
    expect(toShowStatusText(running("clip", 1))).toBe("Émission en cours : clip 2 sur 5.");
  });

  it("dit l'ouverture et la clôture", () => {
    expect(toShowStatusText(running("opening", 0))).toBe("Émission en cours : ouverture.");
    expect(toShowStatusText(running("closing", 0))).toBe("Émission en cours : clôture.");
  });

  it("dit que l'émission est terminée et comment la relancer", () => {
    expect(toShowStatusText({ ...IDLE_SHOW, status: "over" })).toBe(
      "Émission terminée. Cache puis remets la source pour la relancer.",
    );
  });
});
