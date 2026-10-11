import { describe, expect, it } from "vitest";
import type { EditableSettings } from "../../domain/settings.schema";
import { SLIDER_KEYS, SLIDERS, type SliderSpec, toNearestStep } from "./head-fields";
import { toChanges, toFieldErrors, toRemainingDrafts } from "./settings-changes";

const effective: EditableSettings = { threshold: -40, tilt: 1, opening: 1.8, voiceEffect: 0.5, idleAngle: 6 };

const spec = (key: string): SliderSpec => {
  const found = SLIDERS.find((slider) => slider.key === key);
  if (!found) throw new Error(`curseur absent : ${key}`);
  return found;
};

const labelsOf = (key: string): string[] => spec(key).steps.map(({ label }) => label);
const valuesOf = (key: string): number[] => spec(key).steps.map(({ value }) => value);

describe("les curseurs de l'onglet", () => {
  it("sont cinq, dans l'ordre : seuil, pivot, ouverture, effet de la voix, penché au repos", () => {
    expect(SLIDERS.map(({ label }) => label)).toEqual([
      "Seuil du micro",
      "Pivot",
      "Ouverture",
      "Effet de la voix",
      "Penché au repos",
    ]);
    expect(SLIDER_KEYS).toEqual(["threshold", "tilt", "opening", "voiceEffect", "idleAngle"]);
  });

  it("ont une aide courte, de sept mots au plus", () => {
    for (const { help } of SLIDERS) {
      expect(help.length).toBeGreaterThan(0);
      expect(help.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
  });

  it("règlent le seuil de -60 à 0 dB par pas de 1", () => {
    expect(spec("threshold").steps).toHaveLength(61);
    expect(valuesOf("threshold").slice(0, 3)).toEqual([-60, -59, -58]);
    expect(labelsOf("threshold").at(0)).toBe("-60 dB");
    expect(labelsOf("threshold").at(-1)).toBe("0 dB");
  });

  it("règlent le pivot de ×0 à ×2 par pas de 0,1, sans reste de virgule flottante", () => {
    expect(spec("tilt").steps).toHaveLength(21);
    expect(valuesOf("tilt").slice(0, 4)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(labelsOf("tilt").slice(0, 2)).toEqual(["×0", "×0,1"]);
    expect(labelsOf("tilt").at(-1)).toBe("×2");
  });

  it("règlent l'ouverture de ×0 à ×3 par pas de 0,1", () => {
    expect(spec("opening").steps).toHaveLength(31);
    expect(labelsOf("opening").at(-1)).toBe("×3");
    expect(valuesOf("opening")).toContain(1.8);
  });

  it("règlent l'effet de la voix de 0 à 100 % par pas de 10, la valeur du réglage étant une fraction", () => {
    expect(labelsOf("voiceEffect")).toEqual([
      "0 %",
      "10 %",
      "20 %",
      "30 %",
      "40 %",
      "50 %",
      "60 %",
      "70 %",
      "80 %",
      "90 %",
      "100 %",
    ]);
    expect(valuesOf("voiceEffect")).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it("règlent le penché au repos de 0 à 15° par pas de 1", () => {
    expect(spec("idleAngle").steps).toHaveLength(16);
    expect(labelsOf("idleAngle").at(0)).toBe("0°");
    expect(labelsOf("idleAngle").at(-1)).toBe("15°");
  });
});

describe("toNearestStep", () => {
  it("rend le cran lui-même quand la valeur est sur un cran", () => {
    expect(toNearestStep(spec("threshold"), -35)).toBe(-35);
    expect(toNearestStep(spec("tilt"), 0.5)).toBe(0.5);
    expect(toNearestStep(spec("voiceEffect"), 1)).toBe(1);
  });

  it("place une valeur de settings.json entre deux crans sur le plus proche", () => {
    expect(toNearestStep(spec("tilt"), 0.83)).toBe(0.8);
    expect(toNearestStep(spec("opening"), 1.77)).toBe(1.8);
    expect(toNearestStep(spec("idleAngle"), 6.4)).toBe(6);
  });

  it("reste dans les bornes quand la valeur les dépasse", () => {
    expect(toNearestStep(spec("opening"), 9)).toBe(3);
    expect(toNearestStep(spec("threshold"), -100)).toBe(-60);
  });

  it("montre ce que le serveur applique quand le réglage n'a pas de valeur", () => {
    expect(toNearestStep(spec("voiceEffect"), undefined)).toBe(1);
    expect(toNearestStep(spec("idleAngle"), null)).toBe(0);
  });
});

describe("toChanges", () => {
  it("n'envoie rien quand rien n'est choisi", () => {
    expect(toChanges({}, {}, effective)).toEqual({});
  });

  it("envoie chaque brouillon qui diffère de ce qui s'applique, et ignore celui qui est déjà appliqué", () => {
    expect(toChanges({ threshold: -35, tilt: 1 }, {}, effective)).toEqual({ threshold: -35 });
  });

  it("renvoie les brouillons déjà refusés avec le changement suivant", () => {
    expect(toChanges({ opening: 3, tilt: 0.5 }, {}, effective)).toEqual({ opening: 3, tilt: 0.5 });
  });

  it("retire le réglage local d'un brouillon vide, et n'envoie rien s'il n'y en a pas", () => {
    expect(toChanges({ threshold: null }, { threshold: -35 }, effective)).toEqual({ threshold: null });
    expect(toChanges({ threshold: null }, {}, effective)).toEqual({});
  });

  it("envoie la valeur d'un réglage qui n'avait pas de valeur", () => {
    const bare: EditableSettings = { threshold: -40 };
    expect(toChanges({ voiceEffect: 0.7 }, {}, bare)).toEqual({ voiceEffect: 0.7 });
  });
});

describe("toRemainingDrafts", () => {
  it("ne garde que les brouillons que le serveur n'a pas pris en compte", () => {
    const applied = { ...effective, threshold: -35 };
    expect(toRemainingDrafts({ threshold: -35, opening: 3 }, { threshold: -35 }, applied)).toEqual({
      opening: 3,
    });
  });

  it("lâche un brouillon vide une fois son réglage local retiré", () => {
    expect(toRemainingDrafts({ threshold: null }, {}, effective)).toEqual({});
  });
});

describe("toFieldErrors", () => {
  it("range le refus sous le curseur qu'il nomme, avec son libellé", () => {
    const errors = toFieldErrors([
      { path: "voiceEffect", message: "voiceEffect doit être d'au plus 1 (100 %)" },
    ]);
    expect(errors.byKey).toEqual({ voiceEffect: "« Effet de la voix » doit être d'au plus 1 (100 %)" });
    expect(errors.general).toEqual([]);
  });

  it("garde le premier message d'un curseur", () => {
    const errors = toFieldErrors([
      { path: "tilt", message: "premier" },
      { path: "tilt", message: "second" },
    ]);
    expect(errors.byKey.tilt).toBe("premier");
  });

  it("met en haut une règle entre plusieurs réglages, une panne, ou un réglage qui ne se change pas ici", () => {
    const errors = toFieldErrors([
      { path: "loudLevel", message: "loudLevel doit dépasser threshold" },
      { path: "", message: "le serveur ne répond pas" },
      { path: "micName", message: "réglage inconnu, ou qui ne se change pas ici" },
    ]);
    expect(errors.byKey).toEqual({});
    expect(errors.general).toEqual([
      "loudLevel : loudLevel doit dépasser « Seuil du micro »",
      "le serveur ne répond pas",
      "micName : réglage inconnu, ou qui ne se change pas ici",
    ]);
  });

  it("écrit les noms des réglages avec les libellés des curseurs, mot entier seulement", () => {
    const errors = toFieldErrors([
      { path: "opening", message: "opening ne peut pas être négatif (openings)" },
    ]);
    expect(errors.byKey.opening).toBe("« Ouverture » ne peut pas être négatif (openings)");
  });
});
