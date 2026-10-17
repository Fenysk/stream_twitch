import { describe, expect, it } from "vitest";
import { toByteRange } from "./video-range.rules";

describe("toByteRange", () => {
  it("rend tout le fichier sans en-tête Range", () => {
    expect(toByteRange(null, 1000)).toEqual({ kind: "full" });
  });

  it("lit un intervalle fermé, bornes comprises", () => {
    expect(toByteRange("bytes=0-99", 1000)).toEqual({ kind: "partial", start: 0, end: 99 });
    expect(toByteRange("bytes=500-500", 1000)).toEqual({ kind: "partial", start: 500, end: 500 });
  });

  it("lit un intervalle ouvert jusqu'à la fin du fichier (ce que demande un lecteur vidéo)", () => {
    expect(toByteRange("bytes=250-", 1000)).toEqual({ kind: "partial", start: 250, end: 999 });
  });

  it("lit les derniers octets avec un intervalle négatif", () => {
    expect(toByteRange("bytes=-100", 1000)).toEqual({ kind: "partial", start: 900, end: 999 });
    expect(toByteRange("bytes=-5000", 1000)).toEqual({ kind: "partial", start: 0, end: 999 });
  });

  it("ramène une fin trop grande à la fin du fichier", () => {
    expect(toByteRange("bytes=900-5000", 1000)).toEqual({ kind: "partial", start: 900, end: 999 });
  });

  it("refuse un début au-delà du fichier, une fin avant le début, un intervalle vide ou un fichier vide", () => {
    expect(toByteRange("bytes=1000-", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(toByteRange("bytes=2000-3000", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(toByteRange("bytes=200-100", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(toByteRange("bytes=-0", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(toByteRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignore un en-tête qu'il ne comprend pas : plusieurs intervalles, une autre unité, du texte", () => {
    expect(toByteRange("bytes=0-10,20-30", 1000)).toEqual({ kind: "full" });
    expect(toByteRange("items=0-10", 1000)).toEqual({ kind: "full" });
    expect(toByteRange("bytes=abc", 1000)).toEqual({ kind: "full" });
    expect(toByteRange("bytes=-", 1000)).toEqual({ kind: "full" });
  });
});
