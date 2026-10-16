import { describe, expect, it } from "vitest";
import { toInstant, toInstantText } from "./instant.rules";

const AT = Date.UTC(2026, 9, 16, 13, 0, 0);

describe("toInstant : le texte ISO d'un instant", () => {
  it("lit un instant en UTC, avec ou sans millisecondes", () => {
    expect(toInstant("2026-10-16T13:00:00.000Z")).toBe(AT);
    expect(toInstant("2026-10-16T13:00:00Z")).toBe(AT);
    expect(toInstant("2026-10-16T13:00:00.5Z")).toBe(AT + 500);
  });

  it("lit un instant avec un décalage : 15 h à Paris, c'est 13 h UTC", () => {
    expect(toInstant("2026-10-16T15:00:00+02:00")).toBe(AT);
    expect(toInstant("2026-10-16T08:00:00-05:00")).toBe(AT);
  });

  it("rend null pour le texte vide (pas d'instant)", () => {
    expect(toInstant("")).toBeNull();
  });

  it("rend null pour un texte qui n'est pas un instant complet", () => {
    for (const text of [
      "15:00",
      "2026-10-16",
      "2026-10-16T13:00",
      "2026-10-16 13:00:00Z",
      "2026-10-16T13:00:00",
      " 2026-10-16T13:00:00Z",
      "2026-13-16T13:00:00Z",
      "2026-10-32T13:00:00Z",
      "2026-10-16T24:00:00Z",
      "2026-10-16T13:60:00Z",
      "hier",
    ]) {
      expect(toInstant(text), text).toBeNull();
    }
  });
});

describe("toInstantText : un instant écrit pour un réglage", () => {
  it("écrit l'ISO en UTC, que toInstant relit", () => {
    expect(toInstantText(AT)).toBe("2026-10-16T13:00:00.000Z");
    expect(toInstant(toInstantText(AT))).toBe(AT);
  });

  it("écrit le texte vide pour null", () => {
    expect(toInstantText(null)).toBe("");
  });
});
