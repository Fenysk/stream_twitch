import { describe, expect, it } from "vitest";
import { ClipConfirmationSchema } from "./clip.schema";
import {
  isLaughKept,
  isLaughOverEnd,
  toDefaultSound,
  toKnownLaughs,
  toLaughAt,
  toLaughRank,
  toLaughsJson,
} from "./laugh.rules";
import { toStepStart } from "./trim.rules";

describe("toLaughAt", () => {
  const trim = { start: 2, end: 8 };

  it("cale l'instant sur le début de l'image la plus proche (1/60 s)", () => {
    expect(toLaughAt(3.004, trim)).toBeCloseTo(180 / 60, 10);
    expect(toLaughAt(3.012, trim)).toBeCloseTo(181 / 60, 10);
  });

  it("pose un rire sur le début de l'image affichée quand on lui donne celui-ci (la position de lecture)", () => {
    expect(toLaughAt(toStepStart(5.5083), trim)).toBeCloseTo(330 / 60, 10);
  });

  it("ne sort jamais de la partie gardée : ni avant le début, ni après la fin", () => {
    expect(toLaughAt(1, trim)).toBe(2);
    expect(toLaughAt(0, trim)).toBe(2);
    expect(toLaughAt(20, trim)).toBe(8);
  });

  it("garde le début et la fin exacts quand ils ne tombent pas sur une image", () => {
    const offGrid = { start: 2.01, end: 7.99 };
    expect(toLaughAt(2.0, offGrid)).toBe(2.01);
    expect(toLaughAt(8.5, offGrid)).toBe(7.99);
  });
});

describe("isLaughKept", () => {
  const trim = { start: 2, end: 8 };

  it("garde un rire de la partie gardée, début et fin compris : un rire à la fin part quand la vidéo finit", () => {
    expect(isLaughKept(5, trim)).toBe(true);
    expect(isLaughKept(2, trim)).toBe(true);
    expect(isLaughKept(8, trim)).toBe(true);
  });

  it("écarte un rire d'avant le début ou d'après la fin (après une recoupe)", () => {
    expect(isLaughKept(1.99, trim)).toBe(false);
    expect(isLaughKept(8.01, trim)).toBe(false);
  });

  it("pardonne un millionième de seconde de flottant aux deux bords", () => {
    expect(isLaughKept(8 + 1e-7, trim)).toBe(true);
    expect(isLaughKept(2 - 1e-7, trim)).toBe(true);
    expect(isLaughKept(8 + 1e-5, trim)).toBe(false);
  });
});

describe("isLaughOverEnd", () => {
  it("dit qu'un rire dépasse la fin quand son instant plus la durée de son sound est après la fin", () => {
    expect(isLaughOverEnd(7, 1.5, 8)).toBe(true);
    expect(isLaughOverEnd(8, 0.2, 8)).toBe(true);
  });

  it("ne dépasse pas quand il finit avant la fin, ou pile à la fin", () => {
    expect(isLaughOverEnd(6, 1.5, 8)).toBe(false);
    expect(isLaughOverEnd(6.5, 1.5, 8)).toBe(false);
  });
});

describe("toLaughRank", () => {
  it("donne le rang du rire par instant croissant, et le nombre de rires", () => {
    const ats = [5, 1, 3];
    expect(toLaughRank(ats, 0)).toEqual({ rank: 3, count: 3 });
    expect(toLaughRank(ats, 1)).toEqual({ rank: 1, count: 3 });
    expect(toLaughRank(ats, 2)).toEqual({ rank: 2, count: 3 });
  });

  it("départage deux rires au même instant par leur ordre dans la liste", () => {
    const ats = [2, 2, 1];
    expect(toLaughRank(ats, 0)).toEqual({ rank: 2, count: 3 });
    expect(toLaughRank(ats, 1)).toEqual({ rank: 3, count: 3 });
    expect(toLaughRank(ats, 2)).toEqual({ rank: 1, count: 3 });
  });

  it("donne 1 sur 1 à un rire seul", () => {
    expect(toLaughRank([4.5], 0)).toEqual({ rank: 1, count: 1 });
  });
});

describe("toDefaultSound", () => {
  const sounds = [
    { id: "cccc0003", title: "Rire gras" },
    { id: "aaaa0001", title: "Applaudissements" },
    { id: "bbbb0002", title: "Rire enregistré" },
  ];

  it("reprend le dernier sound choisi quand la soundboard l'a toujours", () => {
    expect(toDefaultSound(sounds, "bbbb0002")).toBe("bbbb0002");
  });

  it("prend le premier par ordre alphabétique de titre au départ, ou quand le dernier a été supprimé", () => {
    expect(toDefaultSound(sounds, null)).toBe("aaaa0001");
    expect(toDefaultSound(sounds, "disparu1")).toBe("aaaa0001");
  });

  it("ne donne rien tant que la soundboard n'est pas lue, ou quand elle est vide", () => {
    expect(toDefaultSound(null, "aaaa0001")).toBeUndefined();
    expect(toDefaultSound([], "aaaa0001")).toBeUndefined();
  });

  it("ne change pas la liste qu'on lui donne", () => {
    const given = [...sounds];
    toDefaultSound(given, null);
    expect(given).toEqual(sounds);
  });
});

describe("toKnownLaughs", () => {
  const laughs = [
    { at: 1, sound: "aaaa0001" },
    { at: 2, sound: "disparu1" },
    { at: 3, sound: "bbbb0002" },
  ];

  it("écarte les rires dont le sound n'est plus dans la soundboard, dans l'ordre", () => {
    expect(toKnownLaughs(laughs, [{ id: "bbbb0002" }, { id: "aaaa0001" }])).toEqual([
      { at: 1, sound: "aaaa0001" },
      { at: 3, sound: "bbbb0002" },
    ]);
  });

  it("garde tous les rires tant que la soundboard n'est pas lue : on ne sait pas encore ce qui existe", () => {
    expect(toKnownLaughs(laughs, null)).toEqual(laughs);
  });

  it("n'en garde aucun quand la soundboard est lue et vide", () => {
    expect(toKnownLaughs(laughs, [])).toEqual([]);
  });
});

describe("toLaughsJson : le JSON d'avant les rires placés", () => {
  const legacy = { title: "Le saut", phrase: "", start: 2, end: 12.5, laugh: "abcd1234" };

  it("lit l'ancien `laugh` comme un rire à la fin du clip, et le fait disparaître", () => {
    const json = toLaughsJson(legacy);
    expect(json).toEqual({
      title: "Le saut",
      phrase: "",
      start: 2,
      end: 12.5,
      laughs: [{ at: 12.5, sound: "abcd1234" }],
    });
    expect(json).not.toHaveProperty("laugh");
  });

  it("donne au schéma d'un clip confirmé un JSON qu'il lit : `laughs` en place, plus de `laugh`", () => {
    const parsed = ClipConfirmationSchema.parse(
      toLaughsJson({ ...legacy, rawName: "a.mp4", confirmedAt: "2026-10-16T10:00:00.000Z" }),
    );
    expect(parsed.laughs).toEqual([{ at: 12.5, sound: "abcd1234" }]);
    expect(parsed).not.toHaveProperty("laugh");
  });

  it("laisse `laughs` tel quel quand le JSON l'a déjà, et jette l'ancien `laugh`", () => {
    const json = toLaughsJson({ ...legacy, laughs: [{ at: 3, sound: "bbbb0002" }] });
    expect(json).toMatchObject({ laughs: [{ at: 3, sound: "bbbb0002" }] });
    expect(json).not.toHaveProperty("laugh");
  });

  it("ne crée aucun rire d'un `laugh` vide, ni quand la fin manque", () => {
    expect(toLaughsJson({ ...legacy, laugh: "  " })).not.toHaveProperty("laughs");
    expect(toLaughsJson({ ...legacy, laugh: "" })).not.toHaveProperty("laugh");
    const withoutEnd = toLaughsJson({ title: "Le saut", laugh: "abcd1234" });
    expect(withoutEnd).not.toHaveProperty("laughs");
    expect(withoutEnd).not.toHaveProperty("laugh");
  });

  it("rend tel quel un JSON sans `laugh`, et tout ce qui n'est pas un objet", () => {
    const current = { title: "Le saut", end: 12.5, laughs: [{ at: 3, sound: "bbbb0002" }] };
    expect(toLaughsJson(current)).toEqual(current);
    expect(toLaughsJson(null)).toBeNull();
    expect(toLaughsJson("texte")).toBe("texte");
    expect(toLaughsJson([legacy])).toEqual([legacy]);
  });
});
