import { describe, expect, it } from "vitest";
import { isAtKeptEnd, toLaughsDue, toLaughsUnderway } from "./laugh-preview.rules";
import { STEP_SECONDS } from "./trim.rules";

// On garde de 10 s à 50 s du clip brut.
const kept = { start: 10, end: 50 };

describe("toLaughsDue", () => {
  const laughs = [
    { at: 5, sound: "avant" },
    { at: 12, sound: "a" },
    { at: 20, sound: "b" },
    { at: 20, sound: "c" },
    { at: 50, sound: "fin" },
    { at: 60, sound: "après" },
  ];
  const sounds = (due: { sound: string }[]) => due.map(({ sound }) => sound);

  it("rend les rires qui partent entre deux positions : de `from` compris à `to` exclu", () => {
    expect(sounds(toLaughsDue(laughs, 12, 20, kept))).toEqual(["a"]);
    expect(sounds(toLaughsDue(laughs, 12, 20.5, kept))).toEqual(["a", "b", "c"]);
    expect(sounds(toLaughsDue(laughs, 20, 20, kept))).toEqual([]);
  });

  it("ne rend jamais un rire hors de la partie gardée : ni avant le début, ni après la fin", () => {
    expect(sounds(toLaughsDue(laughs, 0, 100, kept))).toEqual(["a", "b", "c", "fin"]);
  });

  it("garde un rire posé pile à la fin : il part avec la fin de la lecture", () => {
    expect(sounds(toLaughsDue(laughs, 20.5, Number.POSITIVE_INFINITY, kept))).toEqual(["fin"]);
  });

  it("ne perd ni ne double aucun rire entre deux fenêtres qui se suivent", () => {
    const first = toLaughsDue(laughs, 10, 20, kept);
    const second = toLaughsDue(laughs, 20, 50, kept);
    const third = toLaughsDue(laughs, 50, Number.POSITIVE_INFINITY, kept);
    expect(sounds([...first, ...second, ...third])).toEqual(["a", "b", "c", "fin"]);
  });

  it("ne rend rien sans rires, ni quand la lecture n'avance pas", () => {
    expect(toLaughsDue([], 0, 100, kept)).toEqual([]);
    expect(toLaughsDue(laughs, 30, 30, kept)).toEqual([]);
  });
});

describe("toLaughsUnderway", () => {
  const laughs = [
    { at: 12, sound: "a" },
    { at: 14, sound: "b" },
    { at: 30, sound: "inconnu" },
    { at: 8, sound: "a" },
    { at: 20, sound: "b" },
  ];
  const seconds = new Map([
    ["a", 5],
    ["b", 1],
  ]);

  it("rend les rires dont le sound a commencé avant la position et n'a pas fini, avec leur décalage", () => {
    expect(toLaughsUnderway(laughs, 14.5, seconds, kept)).toEqual([
      { laugh: { at: 12, sound: "a" }, offset: 2.5 },
      { laugh: { at: 14, sound: "b" }, offset: 0.5 },
    ]);
  });

  it("ne rend ni un rire qui n'a pas commencé, ni un rire fini", () => {
    expect(toLaughsUnderway(laughs, 11, seconds, kept)).toEqual([]);
    expect(toLaughsUnderway(laughs, 18, seconds, kept)).toEqual([]);
  });

  it("ne rend pas un rire qui commence pile à la position, ni un rire qui finit pile à la position : le premier part avec la lecture", () => {
    expect(toLaughsUnderway(laughs, 12, seconds, kept)).toEqual([]);
    expect(toLaughsUnderway(laughs, 17, seconds, kept)).toEqual([]);
  });

  it("ne rend pas un rire dont on ne connaît pas la durée : on ne sait pas s'il joue encore", () => {
    expect(toLaughsUnderway(laughs, 31, seconds, kept)).toEqual([]);
  });

  it("ne rend jamais un rire hors de la partie gardée, même en route : celui d'avant le début ne joue pas", () => {
    expect(toLaughsUnderway(laughs, 9, seconds, kept)).toEqual([]);
  });
});

describe("isAtKeptEnd", () => {
  it("dit que la position est sur la fin gardée, à une image ou deux près : où la lecture de la sélection s'arrête", () => {
    expect(isAtKeptEnd(50, kept)).toBe(true);
    expect(isAtKeptEnd(50 - STEP_SECONDS, kept)).toBe(true);
    expect(isAtKeptEnd(50 - 1.5 * STEP_SECONDS, kept)).toBe(true);
    expect(isAtKeptEnd(55, kept)).toBe(true);
  });

  it("dit que la position n'y est pas plus tôt", () => {
    expect(isAtKeptEnd(49.9, kept)).toBe(false);
    expect(isAtKeptEnd(20, kept)).toBe(false);
  });
});
