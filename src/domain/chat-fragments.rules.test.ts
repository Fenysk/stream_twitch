import { describe, expect, it } from "vitest";
import { toFragments } from "./chat-fragments.rules";

const kappa = (start: number, end: number) => ({ id: "25", start, end });

// Écrits en échappements : un éditeur ne doit pas pouvoir les réduire à un autre emoji.
const GRINNING = "\u{1F600}";
const FAMILY = "\u{1F468}‍\u{1F469}‍\u{1F467}";
const PARTY = "\u{1F389}";

describe("toFragments", () => {
  it("rend un seul texte quand le message n'a pas d'emote", () => {
    expect(toFragments("Salut le stream", [])).toEqual([{ kind: "text", text: "Salut le stream" }]);
  });

  it("ne rend rien pour un texte vide", () => {
    expect(toFragments("", [])).toEqual([]);
  });

  it("coupe le texte autour d'une emote, nommée par le texte qu'elle remplace", () => {
    expect(toFragments("Salut Kappa !", [kappa(6, 10)])).toEqual([
      { kind: "text", text: "Salut " },
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "text", text: " !" },
    ]);
  });

  it("n'ajoute aucun texte vide quand l'emote est au début, à la fin ou collée à une autre", () => {
    expect(toFragments("KappaKappa", [kappa(0, 4), kappa(5, 9)])).toEqual([
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "emote", id: "25", name: "Kappa" },
    ]);
  });

  it("lit les positions en points de code : un emoji avant l'emote ne les décale pas", () => {
    // L'emoji vaut 2 unités UTF-16 mais 1 point de code : Kappa est aux positions 5 à 9 pour Twitch.
    expect(toFragments(`${GRINNING} hi Kappa`, [kappa(5, 9)])).toEqual([
      { kind: "text", text: `${GRINNING} hi ` },
      { kind: "emote", id: "25", name: "Kappa" },
    ]);
  });

  it("garde le bon texte après plusieurs emojis, dont un emoji composé, et une emote répétée", () => {
    // La famille compte 5 points de code (trois personnes, deux liens invisibles), la fête 1.
    expect(toFragments(`${FAMILY}${PARTY} Kappa ok Kappa`, [kappa(7, 11), kappa(16, 20)])).toEqual([
      { kind: "text", text: `${FAMILY}${PARTY} ` },
      { kind: "emote", id: "25", name: "Kappa" },
      { kind: "text", text: " ok " },
      { kind: "emote", id: "25", name: "Kappa" },
    ]);
  });

  it("remet dans l'ordre des emotes reçues dans le désordre, de plusieurs sortes", () => {
    expect(toFragments("LUL Kappa", [kappa(4, 8), { id: "425618", start: 0, end: 2 }])).toEqual([
      { kind: "emote", id: "425618", name: "LUL" },
      { kind: "text", text: " " },
      { kind: "emote", id: "25", name: "Kappa" },
    ]);
  });

  it("ignore une emote hors du texte, à l'envers ou qui en chevauche une autre : son texte reste", () => {
    expect(toFragments("Kappa", [kappa(3, 12)])).toEqual([{ kind: "text", text: "Kappa" }]);
    expect(toFragments("Kappa", [kappa(4, 2)])).toEqual([{ kind: "text", text: "Kappa" }]);
    expect(toFragments("Kappa", [kappa(-1, 2)])).toEqual([{ kind: "text", text: "Kappa" }]);
    expect(toFragments("Kappa", [kappa(0, 2), { id: "1", start: 1, end: 4 }])).toEqual([
      { kind: "emote", id: "25", name: "Kap" },
      { kind: "text", text: "pa" },
    ]);
  });
});
