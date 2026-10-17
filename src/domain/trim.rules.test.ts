import { describe, expect, it } from "vitest";
import {
  STEP_SECONDS,
  toClipKey,
  toEndAt,
  toFraction,
  toNearestStep,
  toStartAt,
  toStepEnd,
  toStepIndex,
  toStepMiddle,
  toSteppedTime,
  toStepStart,
  toTimeAt,
} from "./trim.rules";

describe("une image dure 1/60 s", () => {
  it("donne la durée d'une image d'un clip à 60 i/s", () => {
    expect(STEP_SECONDS).toBeCloseTo(1 / 60, 10);
  });

  it("repère l'image affichée à un instant : le début de l'image pour le début, la fin de l'image pour la fin", () => {
    // 1,01 s tombe dans l'image 60 (de 1 s à 1,01667 s).
    expect(toStepStart(1.01)).toBeCloseTo(60 / 60, 10);
    expect(toStepEnd(1.01)).toBeCloseTo(61 / 60, 10);
  });

  it("reconnaît le début exact d'une image malgré les arrondis des flottants", () => {
    expect(toStepStart(3 * STEP_SECONDS)).toBeCloseTo(3 / 60, 10);
    expect(toStepEnd(3 * STEP_SECONDS)).toBeCloseTo(4 / 60, 10);
  });

  it("vise le milieu d'une image pour s'y déplacer, jamais une frontière (le navigateur arrondirait vers l'image d'avant)", () => {
    expect(toStepMiddle(3)).toBeCloseTo(3.5 / 60, 10);
    expect(toStepIndex(toStepMiddle(3))).toBe(3);
  });
});

describe("toSteppedTime", () => {
  it("avance ou recule d'une image, au milieu de l'image visée", () => {
    const position = toStepMiddle(60);
    expect(toSteppedTime(position, 1, 10)).toBeCloseTo(toStepMiddle(61), 10);
    expect(toSteppedTime(position, -1, 10)).toBeCloseTo(toStepMiddle(59), 10);
  });

  it("ne sort pas du clip : ni avant la première image, ni après la dernière", () => {
    expect(toSteppedTime(toStepMiddle(0), -1, 10)).toBeCloseTo(toStepMiddle(0), 10);
    const last = toStepIndex(10 - STEP_SECONDS / 2);
    expect(toStepIndex(toSteppedTime(toStepMiddle(last), 1, 10))).toBe(last);
  });
});

describe("la partie gardée", () => {
  const trim = { start: 2, end: 8 };

  it("pose le début à l'instant donné, sans jamais dépasser la fin moins une image ni passer sous zéro", () => {
    expect(toStartAt(trim, 3)).toEqual({ start: 3, end: 8 });
    expect(toStartAt(trim, 9).start).toBeCloseTo(8 - STEP_SECONDS, 10);
    expect(toStartAt(trim, -4).start).toBe(0);
  });

  it("pose la fin à l'instant donné, sans jamais passer avant le début plus une image ni dépasser la durée", () => {
    expect(toEndAt(trim, 5, 10)).toEqual({ start: 2, end: 5 });
    expect(toEndAt(trim, 1, 10).end).toBeCloseTo(2 + STEP_SECONDS, 10);
    expect(toEndAt(trim, 30, 10).end).toBe(10);
  });
});

describe("toClipKey", () => {
  it("reconnaît R pour poser un rire et Suppr pour retirer le rire choisi, majuscule comprise", () => {
    expect(toClipKey("r")).toBe("laugh");
    expect(toClipKey("R")).toBe("laugh");
    expect(toClipKey("Delete")).toBe("delete");
  });

  it("laisse Retour arrière à la saisie : seule la touche Suppr retire un rire", () => {
    expect(toClipKey("Backspace")).toBeUndefined();
    expect(toClipKey("delete")).toBeUndefined();
  });

  it("reconnaît I, O, les flèches gauche et droite et Espace, majuscules comprises", () => {
    expect(toClipKey("i")).toBe("start");
    expect(toClipKey("I")).toBe("start");
    expect(toClipKey("o")).toBe("end");
    expect(toClipKey("O")).toBe("end");
    expect(toClipKey("ArrowLeft")).toBe("back");
    expect(toClipKey("ArrowRight")).toBe("forward");
    expect(toClipKey(" ")).toBe("toggle");
  });

  it("ignore toutes les autres touches", () => {
    expect(toClipKey("a")).toBeUndefined();
    expect(toClipKey("ArrowUp")).toBeUndefined();
    expect(toClipKey("Enter")).toBeUndefined();
    expect(toClipKey("constructor")).toBeUndefined();
  });
});

describe("toFraction et toNearestStep", () => {
  it("donne la position d'un instant sur la barre, bornée de 0 à 1, et 0 sans durée", () => {
    expect(toFraction(59, 118)).toBe(0.5);
    expect(toFraction(-3, 118)).toBe(0);
    expect(toFraction(500, 118)).toBe(1);
    expect(toFraction(5, 0)).toBe(0);
  });

  it("cale un instant sur le début de l'image la plus proche", () => {
    expect(toNearestStep(1.0083)).toBeCloseTo(60 / 60, 10);
    expect(toNearestStep(1.0095)).toBeCloseTo(61 / 60, 10);
  });
});

describe("toTimeAt", () => {
  it("convertit une position sur la barre (de 0 à 1) en instant du clip, bornée", () => {
    expect(toTimeAt(0.5, 118)).toBe(59);
    expect(toTimeAt(-0.2, 118)).toBe(0);
    expect(toTimeAt(1.4, 118)).toBe(118);
  });
});
