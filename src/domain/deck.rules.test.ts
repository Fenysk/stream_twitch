import { describe, expect, it } from "vitest";
import {
  isDeckToggle,
  isPresetActive,
  isValueOfSetting,
  toCycleBinding,
  toCycleChanges,
  toEffectiveCycleValue,
  toEffectiveToggle,
  toEffectiveValue,
  toEffectiveValues,
  toNextValue,
  toPhraseBinding,
  toPresetBinding,
  toPresetChanges,
  toToggleBinding,
  toToggleChanges,
} from "./deck.rules";
import type { PresetPair } from "./deck.schema";

describe("toEffectiveToggle", () => {
  it("rend la valeur que le serveur applique, vraie ou fausse", () => {
    expect(toEffectiveToggle({ foxShouldReadChat: true }, "foxShouldReadChat")).toBe(true);
    expect(toEffectiveToggle({ foxShouldReadChat: false }, "foxShouldReadChat")).toBe(false);
    expect(toEffectiveToggle({ chatShouldShowHidden: true }, "chatShouldShowHidden")).toBe(true);
  });

  it("rend la valeur de la page des réglages quand le réglage n'a pas de valeur", () => {
    const effective = {};
    expect(toEffectiveToggle(effective, "foxShouldReadChat")).toBe(true);
    expect(toEffectiveToggle(effective, "foxShouldReadOwn")).toBe(true);
    expect(toEffectiveToggle(effective, "foxShouldReviewAtEnd")).toBe(true);
    expect(toEffectiveToggle(effective, "foxShouldThank")).toBe(true);
    expect(toEffectiveToggle(effective, "foxShouldWelcome")).toBe(true);
    expect(toEffectiveToggle(effective, "chatShouldShowHidden")).toBe(false);
  });
});

describe("toToggleChanges", () => {
  it("demande l'inverse de la valeur effective", () => {
    expect(toToggleChanges({ setting: "foxShouldThank" }, { foxShouldThank: true })).toEqual({
      foxShouldThank: false,
    });
    expect(toToggleChanges({ setting: "foxShouldThank" }, { foxShouldThank: false })).toEqual({
      foxShouldThank: true,
    });
  });

  it("n'écrit que le réglage de la touche", () => {
    const changes = toToggleChanges({ setting: "chatShouldShowHidden" }, { foxShouldThank: false });
    expect(Object.keys(changes)).toEqual(["chatShouldShowHidden"]);
  });

  it("part de la valeur par défaut quand le réglage n'a pas de valeur", () => {
    expect(toToggleChanges({ setting: "foxShouldReadChat" }, {})).toEqual({ foxShouldReadChat: false });
    expect(toToggleChanges({ setting: "chatShouldShowHidden" }, {})).toEqual({ chatShouldShowHidden: true });
  });
});

describe("toToggleBinding", () => {
  it("lit le réglage et le nom d'une touche réglée", () => {
    expect(toToggleBinding({ setting: "foxShouldWelcome", name: "Habitués" })).toEqual({
      setting: "foxShouldWelcome",
      name: "Habitués",
    });
  });

  it("garde un réglage sans nom, et retire les espaces autour du nom", () => {
    expect(toToggleBinding({ setting: "foxShouldWelcome" })).toEqual({ setting: "foxShouldWelcome" });
    expect(toToggleBinding({ setting: "foxShouldWelcome", name: "  Habitués " })?.name).toBe("Habitués");
  });

  it("refuse une touche pas encore réglée, un réglage qui n'est pas une case, ou un texte qui n'est pas un objet", () => {
    expect(toToggleBinding({})).toBeUndefined();
    expect(toToggleBinding({ setting: "foxVoice" })).toBeUndefined();
    expect(toToggleBinding({ setting: "foxShouldThank", name: 12 })).toBeUndefined();
    expect(toToggleBinding("foxShouldThank")).toBeUndefined();
    expect(toToggleBinding(null)).toBeUndefined();
  });
});

describe("toEffectiveValues", () => {
  it("rend une valeur par réglage offert, celle du serveur ou à défaut celle de la page des réglages", () => {
    expect(toEffectiveValues({ foxShouldThank: false })).toEqual({
      foxShouldReadChat: true,
      foxShouldReadOwn: true,
      foxShouldReviewAtEnd: true,
      foxShouldThank: false,
      foxShouldWelcome: true,
      chatShouldShowHidden: false,
      chatTextSize: 20,
      chatOpacity: 85,
      chatDuration: 60,
      chatMaxMessages: 8,
      chatStyle: "pill",
      chatAnimation: "rise",
      expression: "photo",
    });
  });
});

describe("toEffectiveCycleValue", () => {
  it("rend la valeur que le serveur applique", () => {
    expect(toEffectiveCycleValue({ chatTextSize: 32 }, "chatTextSize")).toBe(32);
    expect(toEffectiveCycleValue({ chatDuration: 0 }, "chatDuration")).toBe(0);
    expect(toEffectiveCycleValue({ chatStyle: "panel" }, "chatStyle")).toBe("panel");
    expect(toEffectiveCycleValue({ expression: "fdef51f3" }, "expression")).toBe("fdef51f3");
  });

  it("rend la valeur de la page des réglages quand le réglage n'a pas de valeur, la photo pour l'expression", () => {
    const effective = {};
    expect(toEffectiveCycleValue(effective, "chatTextSize")).toBe(20);
    expect(toEffectiveCycleValue(effective, "chatOpacity")).toBe(85);
    expect(toEffectiveCycleValue(effective, "chatDuration")).toBe(60);
    expect(toEffectiveCycleValue(effective, "chatMaxMessages")).toBe(8);
    expect(toEffectiveCycleValue(effective, "chatStyle")).toBe("pill");
    expect(toEffectiveCycleValue(effective, "chatAnimation")).toBe("rise");
    expect(toEffectiveCycleValue(effective, "expression")).toBe("photo");
  });
});

describe("isValueOfSetting", () => {
  it("accepte une valeur que le schéma du réglage permet", () => {
    expect(isValueOfSetting("chatTextSize", 32)).toBe(true);
    expect(isValueOfSetting("chatDuration", 0)).toBe(true);
    expect(isValueOfSetting("chatStyle", "text")).toBe(true);
    expect(isValueOfSetting("chatAnimation", "fade")).toBe(true);
    expect(isValueOfSetting("expression", "fdef51f3")).toBe(true);
    expect(isValueOfSetting("foxShouldThank", false)).toBe(true);
  });

  it("refuse une valeur hors du schéma : trop grande, d'un autre type, ou hors de l'énumération", () => {
    expect(isValueOfSetting("chatTextSize", 500)).toBe(false);
    expect(isValueOfSetting("chatTextSize", "32")).toBe(false);
    expect(isValueOfSetting("chatOpacity", 101)).toBe(false);
    expect(isValueOfSetting("chatMaxMessages", 2.5)).toBe(false);
    expect(isValueOfSetting("chatStyle", "neon")).toBe(false);
    expect(isValueOfSetting("expression", "")).toBe(false);
    expect(isValueOfSetting("foxShouldThank", "oui")).toBe(false);
  });

  it("refuse l'absence de valeur, que le schéma du réglage accepte parce qu'il est facultatif", () => {
    expect(isValueOfSetting("chatTextSize", undefined)).toBe(false);
    expect(isValueOfSetting("chatStyle", null)).toBe(false);
  });
});

describe("toNextValue", () => {
  it("rend la valeur qui suit la valeur effective dans la liste", () => {
    expect(toNextValue([16, 24, 32], 16)).toBe(24);
    expect(toNextValue([16, 24, 32], 24)).toBe(32);
  });

  it("revient à la première après la dernière", () => {
    expect(toNextValue([16, 24, 32], 32)).toBe(16);
  });

  it("rend la première quand la valeur effective n'est pas dans la liste", () => {
    expect(toNextValue([16, 24, 32], 20)).toBe(16);
    expect(toNextValue(["pill", "panel"], "text")).toBe("pill");
  });

  it("garde la même valeur quand la liste n'en a qu'une, et ne rend rien quand elle est vide", () => {
    expect(toNextValue([24], 24)).toBe(24);
    expect(toNextValue([], 24)).toBeUndefined();
  });

  it("ne confond pas un nombre et son texte, ni zéro et l'absence", () => {
    expect(toNextValue([0, 30], 0)).toBe(30);
    expect(toNextValue(["32", 40], 32)).toBe("32");
  });
});

describe("toCycleChanges", () => {
  it("demande la valeur suivante, pour ce réglage seulement", () => {
    expect(toCycleChanges({ setting: "chatTextSize", values: [16, 24, 32] }, { chatTextSize: 24 })).toEqual({
      chatTextSize: 32,
    });
  });

  it("part de la valeur par défaut quand le réglage n'a pas de valeur", () => {
    expect(toCycleChanges({ setting: "chatTextSize", values: [20, 28] }, {})).toEqual({ chatTextSize: 28 });
    expect(toCycleChanges({ setting: "chatStyle", values: ["text", "pill"] }, {})).toEqual({
      chatStyle: "text",
    });
  });

  it("demande la valeur par défaut de l'expression, null, quand le cycle arrive à la photo", () => {
    const binding = { setting: "expression", values: ["fdef51f3", "photo"] } as const;
    expect(toCycleChanges({ ...binding, values: [...binding.values] }, { expression: "fdef51f3" })).toEqual({
      expression: null,
    });
    expect(toCycleChanges({ ...binding, values: [...binding.values] }, {})).toEqual({
      expression: "fdef51f3",
    });
  });

  it("ne demande rien quand la touche n'a aucune valeur à parcourir", () => {
    expect(toCycleChanges({ setting: "chatTextSize", values: [] }, { chatTextSize: 24 })).toBeUndefined();
  });
});

describe("toCycleBinding", () => {
  it("lit le réglage, ses valeurs et le nom d'une touche réglée", () => {
    expect(toCycleBinding({ setting: "chatTextSize", values: [16, 32], name: "Taille" })).toEqual({
      setting: "chatTextSize",
      values: [16, 32],
      name: "Taille",
    });
  });

  it("n'a aucune valeur tant que le panneau n'en a pas choisi", () => {
    expect(toCycleBinding({ setting: "chatStyle" })).toEqual({ setting: "chatStyle", values: [] });
  });

  it("écarte les valeurs que le schéma du réglage refuse, et celles en double", () => {
    expect(
      toCycleBinding({ setting: "chatTextSize", values: [16, 500, "32", 16, 24, null] })?.values,
    ).toEqual([16, 24]);
    expect(
      toCycleBinding({ setting: "chatStyle", values: ["pill", "neon", "pill", "text"] })?.values,
    ).toEqual(["pill", "text"]);
  });

  it("refuse une touche pas encore réglée, un réglage qui n'est pas offert ici, ou des valeurs qui n'en sont pas une liste", () => {
    expect(toCycleBinding({})).toBeUndefined();
    expect(toCycleBinding({ setting: "foxShouldThank", values: [true] })).toBeUndefined();
    expect(toCycleBinding({ setting: "chatTextSize", values: 16 })).toBeUndefined();
    expect(toCycleBinding(null)).toBeUndefined();
  });
});

describe("toEffectiveValue", () => {
  it("rend la valeur d'une case ou d'un réglage à valeurs discrètes, avec les valeurs par défaut de la page des réglages", () => {
    expect(toEffectiveValue({ foxShouldThank: false }, "foxShouldThank")).toBe(false);
    expect(toEffectiveValue({}, "foxShouldThank")).toBe(true);
    expect(toEffectiveValue({ chatTextSize: 32 }, "chatTextSize")).toBe(32);
    expect(toEffectiveValue({}, "chatStyle")).toBe("pill");
    expect(toEffectiveValue({}, "expression")).toBe("photo");
  });
});

describe("toPresetBinding", () => {
  it("lit le nom et les paires réglage et valeur d'une touche réglée", () => {
    const pairs = [
      { setting: "foxShouldReadChat", value: false },
      { setting: "chatTextSize", value: 32 },
    ];
    expect(toPresetBinding({ name: "Mode jeu", pairs })).toEqual({ name: "Mode jeu", pairs });
  });

  it("n'a aucune paire tant que le panneau n'en a pas choisi", () => {
    expect(toPresetBinding({})).toEqual({ pairs: [] });
    expect(toPresetBinding({ name: "Mode jeu" })).toEqual({ name: "Mode jeu", pairs: [] });
  });

  it("écarte les paires dont le réglage n'est pas offert ou dont la valeur est refusée par le schéma du réglage", () => {
    const binding = toPresetBinding({
      pairs: [
        { setting: "foxVoice", value: "Claude" },
        { setting: "chatTextSize", value: 500 },
        { setting: "chatStyle", value: "neon" },
        { setting: "foxShouldThank", value: "oui" },
        { setting: "chatOpacity" },
        "chatOpacity",
        null,
        { setting: "chatOpacity", value: 50 },
      ],
    });
    expect(binding?.pairs).toEqual([{ setting: "chatOpacity", value: 50 }]);
  });

  it("garde la première paire d'un réglage donné plusieurs fois", () => {
    expect(
      toPresetBinding({
        pairs: [
          { setting: "chatTextSize", value: 24 },
          { setting: "chatTextSize", value: 32 },
        ],
      })?.pairs,
    ).toEqual([{ setting: "chatTextSize", value: 24 }]);
  });

  it("refuse des réglages qui ne sont pas un objet, ou des paires qui ne sont pas une liste", () => {
    expect(toPresetBinding("Mode jeu")).toBeUndefined();
    expect(toPresetBinding(null)).toBeUndefined();
    expect(toPresetBinding({ pairs: "chatTextSize" })).toBeUndefined();
  });
});

describe("toPresetChanges", () => {
  it("demande toutes les paires d'un seul coup", () => {
    expect(
      toPresetChanges({
        name: "Mode jeu",
        pairs: [
          { setting: "foxShouldReadChat", value: false },
          { setting: "chatTextSize", value: 32 },
          { setting: "chatStyle", value: "panel" },
        ],
      }),
    ).toEqual({ foxShouldReadChat: false, chatTextSize: 32, chatStyle: "panel" });
  });

  it("demande null pour l'expression photo : le serveur retire le réglage, comme la page", () => {
    expect(toPresetChanges({ pairs: [{ setting: "expression", value: "photo" }] })).toEqual({
      expression: null,
    });
    expect(toPresetChanges({ pairs: [{ setting: "expression", value: "fdef51f3" }] })).toEqual({
      expression: "fdef51f3",
    });
  });

  it("ne demande rien quand le préréglage n'a aucune paire", () => {
    expect(toPresetChanges({ pairs: [] })).toBeUndefined();
  });
});

describe("isPresetActive", () => {
  const pairs = [
    { setting: "foxShouldReadChat", value: false },
    { setting: "chatTextSize", value: 32 },
  ] satisfies PresetPair[];

  it("est actif quand toutes les valeurs du préréglage sont les valeurs effectives", () => {
    expect(isPresetActive({ pairs }, { foxShouldReadChat: false, chatTextSize: 32 })).toBe(true);
  });

  it("n'est pas actif dès qu'une valeur diffère", () => {
    expect(isPresetActive({ pairs }, { foxShouldReadChat: true, chatTextSize: 32 })).toBe(false);
    expect(isPresetActive({ pairs }, { foxShouldReadChat: false, chatTextSize: 24 })).toBe(false);
  });

  it("compte les valeurs par défaut de la page des réglages pour les réglages absents", () => {
    expect(isPresetActive({ pairs: [{ setting: "foxShouldReadChat", value: true }] }, {})).toBe(true);
    expect(isPresetActive({ pairs: [{ setting: "expression", value: "photo" }] }, {})).toBe(true);
    expect(isPresetActive({ pairs: [{ setting: "chatTextSize", value: 32 }] }, {})).toBe(false);
  });

  it("n'est jamais actif sans paire", () => {
    expect(isPresetActive({ pairs: [] }, { foxShouldReadChat: false })).toBe(false);
  });
});

describe("toPhraseBinding", () => {
  it("lit le genre, le texte et le nom d'une touche réglée", () => {
    expect(toPhraseBinding({ kind: "text", text: "Bonjour le tchat", name: "Salut" })).toEqual({
      kind: "text",
      text: "Bonjour le tchat",
      name: "Salut",
    });
    expect(toPhraseBinding({ kind: "review", text: "gardé", name: "Bilan" })).toEqual({
      kind: "review",
      text: "gardé",
      name: "Bilan",
    });
  });

  it("dit un texte, vide, tant que la touche n'est pas réglée", () => {
    expect(toPhraseBinding({})).toEqual({ kind: "text", text: "" });
    expect(toPhraseBinding({ kind: "review" })).toEqual({ kind: "review", text: "" });
  });

  it("retire les espaces autour du nom, pas ceux du texte", () => {
    const binding = toPhraseBinding({ text: " Bonjour ", name: "  Salut " });
    expect(binding?.name).toBe("Salut");
    expect(binding?.text).toBe(" Bonjour ");
  });

  it("refuse un genre inconnu, un texte qui n'en est pas un, ou des réglages qui ne sont pas un objet", () => {
    expect(toPhraseBinding({ kind: "shout" })).toBeUndefined();
    expect(toPhraseBinding({ text: 12 })).toBeUndefined();
    expect(toPhraseBinding("Bonjour")).toBeUndefined();
    expect(toPhraseBinding(null)).toBeUndefined();
  });
});

describe("isDeckToggle", () => {
  it("distingue les réglages à case de ceux à valeurs discrètes", () => {
    expect(isDeckToggle("foxShouldThank")).toBe(true);
    expect(isDeckToggle("chatShouldShowHidden")).toBe(true);
    expect(isDeckToggle("chatTextSize")).toBe(false);
    expect(isDeckToggle("expression")).toBe(false);
  });
});
