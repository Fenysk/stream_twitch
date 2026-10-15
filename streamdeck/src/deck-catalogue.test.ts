import { describe, expect, it } from "vitest";
import { isValueOfSetting } from "../../src/domain/deck.rules";
import { DECK_SETTINGS } from "../../src/domain/deck.schema";
import {
  DEFAULT_PRESET_NAME,
  toChoices,
  toCycleChoices,
  toNearestStep,
  toSettingLabel,
  toSliderSteps,
  toValueLabel,
} from "./deck-catalogue";

const EXPRESSIONS = [
  { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
  { id: "fdef51f3", name: "Neutre", version: "2", isBuiltIn: false },
];

describe("toSettingLabel", () => {
  it("écrit les libellés de la page des réglages pour les cases", () => {
    expect(toSettingLabel("foxShouldReadChat")).toBe("Lire le tchat");
    expect(toSettingLabel("foxShouldReadOwn")).toBe("Lire mes messages");
    expect(toSettingLabel("foxShouldReviewAtEnd")).toBe("Bilan à la fin prévue");
    expect(toSettingLabel("foxShouldThank")).toBe("Remercier les follows, subs et cheers");
    expect(toSettingLabel("foxShouldWelcome")).toBe("Accueillir les habitués");
    expect(toSettingLabel("chatShouldShowHidden")).toBe("Afficher les commandes et les bots");
  });

  it("écrit les libellés de la page des réglages pour les curseurs, les choix et l'expression", () => {
    expect(toSettingLabel("chatTextSize")).toBe("Taille du texte");
    expect(toSettingLabel("chatOpacity")).toBe("Opacité du fond");
    expect(toSettingLabel("chatDuration")).toBe("Durée d'affichage");
    expect(toSettingLabel("chatMaxMessages")).toBe("Messages à l'écran");
    expect(toSettingLabel("chatStyle")).toBe("Style");
    expect(toSettingLabel("chatAnimation")).toBe("Animation d'apparition");
    expect(toSettingLabel("expression")).toBe("Expression");
  });

  it("a un libellé pour chaque réglage offert, jamais le nom du réglage", () => {
    for (const setting of DECK_SETTINGS) expect(toSettingLabel(setting)).not.toBe(setting);
  });
});

describe("toCycleChoices", () => {
  it("offre les crans du curseur de la page, avec leur libellé", () => {
    const sizes = toCycleChoices("chatTextSize", []);
    expect(sizes[0]).toEqual({ value: 12, label: "12 px" });
    expect(sizes.at(-1)).toEqual({ value: 40, label: "40 px" });
    expect(sizes).toHaveLength(15);
    expect(
      toCycleChoices("chatOpacity", [])
        .map(({ label }) => label)
        .slice(0, 3),
    ).toEqual(["0 %", "5 %", "10 %"]);
    expect(toCycleChoices("chatMaxMessages", [])).toHaveLength(18);
  });

  it("offre toutes les durées d'affichage, « Toujours » compris, qui vaut 0", () => {
    const durations = toCycleChoices("chatDuration", []);
    expect(durations.map(({ label }) => label)).toEqual([
      "10 s",
      "15 s",
      "20 s",
      "30 s",
      "45 s",
      "1 min",
      "1 min 30 s",
      "2 min",
      "Toujours",
    ]);
    expect(durations.at(-1)?.value).toBe(0);
  });

  it("offre les styles et les animations de la page des réglages", () => {
    expect(toCycleChoices("chatStyle", [])).toEqual([
      { value: "pill", label: "Pills" },
      { value: "text", label: "Texte seul" },
      { value: "panel", label: "Panneau" },
    ]);
    expect(toCycleChoices("chatAnimation", []).map(({ value }) => value)).toEqual([
      "rise",
      "pop",
      "side",
      "fade",
    ]);
  });

  it("offre les expressions du serveur par leur nom, et aucune tant qu'on ne les a pas lues", () => {
    expect(toCycleChoices("expression", EXPRESSIONS)).toEqual([
      { value: "photo", label: "Photo" },
      { value: "fdef51f3", label: "Neutre" },
    ]);
    expect(toCycleChoices("expression", [])).toEqual([]);
  });

  it("n'offre que des valeurs que le schéma du réglage accepte", () => {
    for (const setting of DECK_SETTINGS) {
      for (const { value } of toChoices(setting, EXPRESSIONS))
        expect(isValueOfSetting(setting, value)).toBe(true);
    }
  });
});

describe("toChoices", () => {
  it("offre vrai ou faux à une case, et les valeurs du cycle aux autres réglages", () => {
    expect(toChoices("foxShouldThank", [])).toEqual([
      { value: true, label: "Activé" },
      { value: false, label: "Désactivé" },
    ]);
    expect(toChoices("chatStyle", [])).toEqual(toCycleChoices("chatStyle", []));
  });
});

describe("toSliderSteps", () => {
  it("rend les crans du curseur de la page pour un réglage à nombre, rien pour les autres", () => {
    expect(toSliderSteps("chatOpacity")?.length).toBe(21);
    expect(toSliderSteps("chatDuration")?.at(-1)).toEqual({ value: 0, label: "Toujours" });
    expect(toSliderSteps("chatStyle")).toBeUndefined();
    expect(toSliderSteps("foxShouldThank")).toBeUndefined();
    expect(toSliderSteps("expression")).toBeUndefined();
  });
});

describe("toNearestStep", () => {
  const steps = [
    { value: 12, label: "12 px" },
    { value: 14, label: "14 px" },
    { value: 16, label: "16 px" },
  ];

  it("rend le cran de la valeur, ou le plus proche quand elle est entre deux crans", () => {
    expect(toNearestStep(steps, 14)).toBe(14);
    expect(toNearestStep(steps, 15.4)).toBe(16);
    expect(toNearestStep(steps, 13.2)).toBe(14);
    expect(toNearestStep(steps, 100)).toBe(16);
    expect(toNearestStep(steps, -3)).toBe(12);
  });

  it("rend le premier cran quand la valeur n'est pas un nombre, et rien sans cran", () => {
    expect(toNearestStep(steps, "x")).toBe(12);
    expect(toNearestStep([], 14)).toBeUndefined();
  });
});

describe("DEFAULT_PRESET_NAME", () => {
  it("est le nom d'un préréglage sans nom", () => {
    expect(DEFAULT_PRESET_NAME).toBe("Préréglage");
  });
});

describe("toValueLabel", () => {
  it("écrit le libellé du cran, ou le nom de l'expression", () => {
    expect(toValueLabel("chatTextSize", 32, [])).toBe("32 px");
    expect(toValueLabel("chatDuration", 0, [])).toBe("Toujours");
    expect(toValueLabel("chatStyle", "panel", [])).toBe("Panneau");
    expect(toValueLabel("expression", "fdef51f3", EXPRESSIONS)).toBe("Neutre");
    expect(toValueLabel("expression", "photo", EXPRESSIONS)).toBe("Photo");
  });

  it("écrit la valeur telle quelle quand la page n'a pas de libellé pour elle", () => {
    expect(toValueLabel("chatTextSize", 23, [])).toBe("23");
    expect(toValueLabel("expression", "fdef51f3", [])).toBe("fdef51f3");
  });
});
