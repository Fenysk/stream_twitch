import { describe, expect, it } from "vitest";
import { toViewersTitle } from "./viewers.rules";

describe("toViewersTitle", () => {
  it("écrit le nombre de viewers quand le live est en cours", () => {
    expect(toViewersTitle({ kind: "live", count: 3 })).toBe("3");
    expect(toViewersTitle({ kind: "live", count: 128 })).toBe("128");
  });

  it("écrit 0 quand le live n'a aucun viewer : zéro n'est ni hors ligne ni inconnu", () => {
    expect(toViewersTitle({ kind: "live", count: 0 })).toBe("0");
  });

  it("écrit Hors ligne sur deux lignes quand le live est hors ligne", () => {
    expect(toViewersTitle({ kind: "offline" })).toBe("Hors\nligne");
  });

  it("écrit un point d'interrogation quand le nombre est inconnu", () => {
    expect(toViewersTitle({ kind: "unknown" })).toBe("?");
  });
});
