import { describe, expect, it } from "vitest";
import type { PresetPair } from "../../../src/domain/deck.schema";
import type { CatalogueState } from "./catalogue-state";
import { toInitialValue, toUpdatedPairs } from "./preset-pairs";

const EXPRESSIONS = [
  { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
  { id: "fdef51f3", name: "Neutre", version: "2", isBuiltIn: false },
];

const readyWith = (values: Record<string, string | number | boolean>): CatalogueState => ({
  status: "ready",
  values,
  expressions: EXPRESSIONS,
});

describe("toUpdatedPairs", () => {
  const pairs: PresetPair[] = [
    { setting: "foxShouldThank", value: false },
    { setting: "chatStyle", value: "text" },
  ];

  it("ajoute la paire d'un réglage à sa place dans l'ordre des réglages offerts, pas à la fin", () => {
    expect(toUpdatedPairs(pairs, "foxShouldReadChat", { setting: "foxShouldReadChat", value: true })).toEqual(
      [
        { setting: "foxShouldReadChat", value: true },
        { setting: "foxShouldThank", value: false },
        { setting: "chatStyle", value: "text" },
      ],
    );
    expect(toUpdatedPairs(pairs, "chatTextSize", { setting: "chatTextSize", value: 32 })).toEqual([
      { setting: "foxShouldThank", value: false },
      { setting: "chatTextSize", value: 32 },
      { setting: "chatStyle", value: "text" },
    ]);
  });

  it("remplace la paire d'un réglage qui en a déjà une", () => {
    expect(toUpdatedPairs(pairs, "chatStyle", { setting: "chatStyle", value: "panel" })).toEqual([
      { setting: "foxShouldThank", value: false },
      { setting: "chatStyle", value: "panel" },
    ]);
  });

  it("retire la paire d'un réglage décoché, sans toucher aux autres", () => {
    expect(toUpdatedPairs(pairs, "foxShouldThank", undefined)).toEqual([
      { setting: "chatStyle", value: "text" },
    ]);
    expect(toUpdatedPairs(pairs, "chatOpacity", undefined)).toEqual(pairs);
  });
});

describe("toInitialValue", () => {
  it("prend la valeur qui s'applique en ce moment quand le panneau la connaît", () => {
    const catalogue = readyWith({
      foxShouldThank: false,
      chatTextSize: 32,
      chatStyle: "panel",
      expression: "fdef51f3",
    });
    expect(toInitialValue("foxShouldThank", catalogue, EXPRESSIONS)).toBe(false);
    expect(toInitialValue("chatTextSize", catalogue, EXPRESSIONS)).toBe(32);
    expect(toInitialValue("chatStyle", catalogue, EXPRESSIONS)).toBe("panel");
    expect(toInitialValue("expression", catalogue, EXPRESSIONS)).toBe("fdef51f3");
  });

  it("prend le cran le plus proche quand la valeur du serveur est entre deux crans", () => {
    expect(toInitialValue("chatTextSize", readyWith({ chatTextSize: 23 }), EXPRESSIONS)).toBe(22);
  });

  it("prend le premier choix quand le panneau ne connaît pas la valeur", () => {
    expect(toInitialValue("foxShouldThank", { status: "loading" }, [])).toBe(true);
    expect(toInitialValue("chatTextSize", { status: "down" }, [])).toBe(12);
    expect(toInitialValue("chatStyle", { status: "loading" }, [])).toBe("pill");
  });

  it("ne rend rien pour une expression tant que le serveur n'a pas dit lesquelles existent", () => {
    expect(toInitialValue("expression", { status: "down" }, [])).toBeUndefined();
  });
});
