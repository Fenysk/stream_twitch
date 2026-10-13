import { describe, expect, it } from "vitest";
import { toInsultList, toInsultMatch } from "./chat-insults.rules";

const LIST = toInsultList(`
# Un commentaire, et des lignes vides.

connard
salope
=con
=pd
=tg
sale juif
niquetamere
`);

describe("toInsultList", () => {
  it("lit une entrée par ligne, sans les commentaires ni les lignes vides", () => {
    expect(LIST.parts.map(({ entry }) => entry)).toEqual(["connard", "salope", "sale juif", "niquetamere"]);
    expect([...LIST.words.values()]).toEqual(["con", "pd", "tg"]);
  });

  it("range une entrée sans « = » dans les entrées cherchées partout, sous sa forme normalisée", () => {
    expect(LIST.parts.find(({ entry }) => entry === "connard")?.key).toBe("connard");
    expect(LIST.parts.find(({ entry }) => entry === "sale juif")?.key).toBe("salejuif");
  });

  it("accepte les fins de ligne Windows et les blancs autour", () => {
    const list = toInsultList("  connard  \r\n=con\r\n");
    expect(list.parts.map(({ entry }) => entry)).toEqual(["connard"]);
    expect([...list.words.values()]).toEqual(["con"]);
  });

  it("ignore une ligne qui ne contient aucune lettre", () => {
    expect(toInsultList("=\n---\n123").parts).toEqual([]);
  });

  it("rend une liste vide pour un fichier vide", () => {
    expect(toInsultList("")).toEqual({ words: new Map(), parts: [] });
  });
});

describe("toInsultMatch : les formes simples", () => {
  it("trouve un mot de la liste dans une phrase, et rend l'entrée de la liste", () => {
    expect(toInsultMatch("quel connard celui-là", LIST)).toBe("connard");
    expect(toInsultMatch("espèce de salope", LIST)).toBe("salope");
  });

  it("ne tient pas compte des majuscules", () => {
    expect(toInsultMatch("CONNARD", LIST)).toBe("connard");
    expect(toInsultMatch("Salope", LIST)).toBe("salope");
  });

  it("ne trouve rien dans une phrase ordinaire", () => {
    expect(toInsultMatch("Bonjour tout le monde, super stream !", LIST)).toBeNull();
    expect(toInsultMatch("", LIST)).toBeNull();
  });
});

describe("toInsultMatch : la normalisation", () => {
  it.each([
    ["accents et majuscules", "CÓNNÀRD"],
    ["chiffres à la place des lettres", "c0nn4rd"],
    ["arobase et dollar", "c0nn@rd et s@l0p3 $alope"],
    ["lettres répétées", "connnnnnard"],
    ["lettres répétées et mélangées", "cooonnnnaaaard"],
    ["espaces entre les lettres", "c o n n a r d"],
    ["points entre les lettres", "c.o.n.n.a.r.d"],
    ["signes au milieu", "con*nard et con-nard"],
    ["tout à la fois", "C 0 N N 4 R D !!!"],
  ])("trouve l'insulte déguisée par : %s", (_name, text) => {
    expect(toInsultMatch(text, LIST)).toBe("connard");
  });

  it("trouve « salope » écrite avec 5 pour s et 3 pour e", () => {
    expect(toInsultMatch("5alop3", LIST)).toBe("salope");
  });

  it("normalise aussi une expression de plusieurs mots", () => {
    expect(toInsultMatch("sale   JUIF", LIST)).toBe("sale juif");
    expect(toInsultMatch("s4le ju1f", LIST)).toBe("sale juif");
    expect(toInsultMatch("saleJuif", LIST)).toBe("sale juif");
  });
});

describe("toInsultMatch : les mots entiers (=mot)", () => {
  it("trouve un mot entier, avec sa ponctuation, ses majuscules et son pluriel", () => {
    expect(toInsultMatch("t'es con", LIST)).toBe("con");
    expect(toInsultMatch("Con !", LIST)).toBe("con");
    expect(toInsultMatch("ces cons", LIST)).toBe("con");
    expect(toInsultMatch("ta gueule, tg", LIST)).toBe("tg");
    expect(toInsultMatch("sale pd", LIST)).toBe("pd");
  });

  it("trouve un mot entier déguisé", () => {
    expect(toInsultMatch("c0nnn", LIST)).toBe("con");
    expect(toInsultMatch("P.D", LIST)).toBeNull();
    expect(toInsultMatch("pdddd", LIST)).toBe("pd");
  });

  it("ne trouve pas le mot quand il est dans un autre mot : pas de faux positif", () => {
    for (const text of [
      "le concert était bien",
      "un conducteur prudent",
      "la console est là",
      "le contrôle technique",
      "une pdf à lire",
      "un tgv rapide",
      "la confiance règne",
      "mon compagnon",
      "un cône orange",
    ]) {
      expect(toInsultMatch(text, LIST), text).toBeNull();
    }
  });

  it("ne cherche pas un mot entier à travers les espaces : « c o n » ne dit pas « con »", () => {
    expect(toInsultMatch("on se voit à 5 h, c o n s", LIST)).toBeNull();
  });
});

describe("toInsultMatch : le trait d'union lie les mots", () => {
  const list = toInsultList("=nique\n=con");

  it("ne trouve pas « nique » dans « pique-nique »", () => {
    expect(toInsultMatch("on fait un pique-nique demain", list)).toBeNull();
    expect(toInsultMatch("Pique-Nique !", list)).toBeNull();
  });

  it("trouve le mot seul, collé à un trait d'union ou de la ponctuation", () => {
    expect(toInsultMatch("nique", list)).toBe("nique");
    expect(toInsultMatch("-nique-", list)).toBe("nique");
    expect(toInsultMatch("(nique)", list)).toBe("nique");
    expect(toInsultMatch("t'es con...", list)).toBe("con");
  });
});

// « conne » et « nigger » ont une lettre doublée : « cône » et « Niger » ne sont pas eux. Une entrée sans lettre doublée
// accepte toujours les lettres répétées à volonté.
describe("toInsultMatch : les lettres doublées de la liste", () => {
  const list = toInsultList("=con\n=conne\n=nigger\nconnard\nsalope\nasshole");

  it("garde les lettres doublées de l'entrée dans sa forme normalisée, et réduit à deux les séries de trois ou plus", () => {
    expect([...list.words.keys()]).toEqual(["con", "conne", "nigger"]);
    expect(list.parts.map(({ key }) => key)).toEqual(["connard", "salope", "asshole"]);
    expect(toInsultList("connnnard").parts[0]?.key).toBe("connard");
  });

  it.each(["conne", "connnne", "CONNE", "c0nn3", "des connes"])("trouve « conne » écrit : %s", (text) => {
    expect(toInsultMatch(text, list)).toBe("conne");
  });

  it("ne cherche pas le mot entier « conne » à travers les signes, comme « con »", () => {
    expect(toInsultMatch("c.o.n.n.e", list)).toBeNull();
  });

  it("ne trouve pas « conne » dans « cône » ni dans « cone » : la lettre doublée manque", () => {
    expect(toInsultMatch("cône", list)).toBeNull();
    expect(toInsultMatch("un cone orange", list)).toBeNull();
    expect(toInsultMatch("Cône", list)).toBeNull();
  });

  it("trouve « con » à part de « conne » : chacun garde son entrée", () => {
    expect(toInsultMatch("t'es con", list)).toBe("con");
    expect(toInsultMatch("t'es conne", list)).toBe("conne");
  });

  it("trouve « nigger » avec ses lettres répétées, son pluriel et ses chiffres", () => {
    for (const text of ["nigger", "NIGGER", "niggers", "niiigger", "nigggger", "n1gg3r", "t'es un nigger"]) {
      expect(toInsultMatch(text, list), text).toBe("nigger");
    }
  });

  it("ne trouve pas « nigger » dans « Niger » : le pays est lu", () => {
    for (const text of [
      "Niger",
      "niger",
      "NIGER",
      "le Niger est un pays",
      "la République du Niger",
      "n1ger",
    ]) {
      expect(toInsultMatch(text, list), text).toBeNull();
    }
  });

  it("trouve une entrée à lettre doublée cherchée partout, déguisée comme avant", () => {
    for (const text of [
      "connard",
      "connnnnard",
      "cooonnnnaaaard",
      "c0nn4rd",
      "c o n n a r d",
      "asshole",
      "assshole",
    ]) {
      expect(toInsultMatch(text, list), text).not.toBeNull();
    }
  });

  it("ne trouve pas une entrée à lettre doublée écrite avec la lettre seule", () => {
    expect(toInsultMatch("conard", list)).toBeNull();
    expect(toInsultMatch("ashole", list)).toBeNull();
  });

  it("trouve toujours une entrée sans lettre doublée avec ses lettres répétées à volonté", () => {
    for (const text of ["salope", "saaalooope", "ssalope", "5alop3"]) {
      expect(toInsultMatch(text, list), text).toBe("salope");
    }
  });
});

describe("toInsultMatch : l'entrée écrite en un seul bloc", () => {
  it("trouve « niquetamere » avec des espaces, des signes ou des chiffres", () => {
    expect(toInsultMatch("nique ta mère", LIST)).toBe("niquetamere");
    expect(toInsultMatch("n1que t4 m3re", LIST)).toBe("niquetamere");
    expect(toInsultMatch("NIQUE-TA-MÈRE", LIST)).toBe("niquetamere");
  });
});
