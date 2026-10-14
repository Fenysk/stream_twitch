import { describe, expect, it } from "vitest";
import { toPredictionLosers } from "./prediction.rules";

describe("toPredictionLosers : qui perd une prédiction résolue", () => {
  it("additionne les viewers des issues perdantes, et cite l'issue perdante la plus suivie", () => {
    const outcomes = [
      { id: "a", title: "Oui", users: 4 },
      { id: "b", title: "Non", users: 7 },
      { id: "c", title: "Peut-être", users: 2 },
    ];
    expect(toPredictionLosers(outcomes, "a")).toEqual({ losers: 9, outcome: "Non" });
    expect(toPredictionLosers(outcomes, "b")).toEqual({ losers: 6, outcome: "Oui" });
  });

  it("ne compte pas l'issue gagnante, même quand elle est la plus suivie", () => {
    const outcomes = [
      { id: "a", title: "Oui", users: 50 },
      { id: "b", title: "Non", users: 1 },
    ];
    expect(toPredictionLosers(outcomes, "a")).toEqual({ losers: 1, outcome: "Non" });
  });

  it("donne la première des issues perdantes à égalité", () => {
    const outcomes = [
      { id: "a", title: "Oui", users: 3 },
      { id: "b", title: "Non", users: 3 },
      { id: "c", title: "Peut-être", users: 3 },
    ];
    expect(toPredictionLosers(outcomes, "a")).toEqual({ losers: 6, outcome: "Non" });
  });

  it("sans perdant, aucune issue citée : tout le monde a gagné", () => {
    const outcomes = [
      { id: "a", title: "Oui", users: 5 },
      { id: "b", title: "Non", users: 0 },
    ];
    expect(toPredictionLosers(outcomes, "a")).toEqual({ losers: 0, outcome: null });
    expect(toPredictionLosers([{ id: "a", title: "Oui", users: 0 }], "a")).toEqual({
      losers: 0,
      outcome: null,
    });
  });

  it("ne dit rien d'une issue gagnante qu'il ne connaît pas : le résultat est illisible", () => {
    expect(toPredictionLosers([{ id: "a", title: "Oui", users: 5 }], "z")).toBeNull();
    expect(toPredictionLosers([], "a")).toBeNull();
  });
});
