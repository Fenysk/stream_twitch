import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPronunciation, toPronunciations, toSpokenText } from "./pronunciation.rules";

describe("toPronunciation : une ligne « abréviation = forme dite »", () => {
  it("lit les deux côtés, sans leurs espaces", () => {
    expect(toPronunciation("wtf = what the fuck")).toEqual({ written: "wtf", spoken: "what the fuck" });
    expect(toPronunciation("  jpp   =   j'en peux plus  ")).toEqual({
      written: "jpp",
      spoken: "j'en peux plus",
    });
    expect(toPronunciation("<3 = cœur")).toEqual({ written: "<3", spoken: "cœur" });
  });

  it("sépare au premier « = » : la forme dite peut en contenir un", () => {
    expect(toPronunciation("egal = a = b")).toEqual({ written: "egal", spoken: "a = b" });
  });

  it("ne lit pas une ligne sans « = » ni une ligne dont un côté est vide", () => {
    for (const line of ["", "wtf", "= bonjour", "wtf =", "  =  ", "=="]) {
      expect(toPronunciation(line), line).toBeNull();
    }
  });
});

describe("toPronunciations", () => {
  it("garde les lignes valides dans l'ordre et laisse les autres", () => {
    expect(toPronunciations(["a = b", "pas valide", "c = d"])).toEqual([
      { written: "a", spoken: "b" },
      { written: "c", spoken: "d" },
    ]);
  });

  it("garde la dernière quand une abréviation revient, sans tenir compte des majuscules", () => {
    expect(toPronunciations(["WTF = un", "wtf = deux"])).toEqual([{ written: "wtf", spoken: "deux" }]);
  });
});

const list = toPronunciations([
  "wtf = what the fuck",
  "gg = gé gé",
  "ggwp = good game well played",
  "<3 = cœur",
  "fenysk = Fénisque",
  "ez = easy",
  "idk = I don't know",
]);

describe("toSpokenText : le texte une fois les abréviations dites", () => {
  it("remplace une abréviation par sa forme parlée", () => {
    expect(toSpokenText("wtf", list)).toBe("what the fuck");
    expect(toSpokenText("Merci Fenysk", list)).toBe("Merci Fénisque");
  });

  it("ne tient pas compte des majuscules", () => {
    expect(toSpokenText("WTF", list)).toBe("what the fuck");
    expect(toSpokenText("Wtf", list)).toBe("what the fuck");
    expect(toSpokenText("FENYSK est là", list)).toBe("Fénisque est là");
  });

  it("ne remplace que des mots entiers : pas au milieu d'un mot ni collé à des lettres ou des chiffres", () => {
    expect(toSpokenText("wtfs", list)).toBe("wtfs");
    expect(toSpokenText("awtf", list)).toBe("awtf");
    expect(toSpokenText("ez2", list)).toBe("ez2");
    expect(toSpokenText("freezer", list)).toBe("freezer");
    expect(toSpokenText("ggwp", list)).toBe("good game well played");
  });

  it("remplace une abréviation entre des signes de ponctuation, une apostrophe ou un tiret", () => {
    expect(toSpokenText("wtf !", list)).toBe("what the fuck !");
    expect(toSpokenText("(gg)", list)).toBe("(gé gé)");
    expect(toSpokenText("c'est ez.", list)).toBe("c'est easy.");
    expect(toSpokenText("bien-joué-gg", list)).toBe("bien-joué-gé gé");
    expect(toSpokenText("Fenysk, Fenysk!", list)).toBe("Fénisque, Fénisque!");
  });

  it("remplace les abréviations faites de signes, seules entre deux espaces", () => {
    expect(toSpokenText("je t'aime <3", list)).toBe("je t'aime cœur");
    expect(toSpokenText("<3 bravo <3", list)).toBe("cœur bravo cœur");
    expect(toSpokenText("a<3b", list)).toBe("a<3b");
  });

  it("remplace chaque abréviation d'une phrase, y compris la même plusieurs fois", () => {
    expect(toSpokenText("gg gg wtf", list)).toBe("gé gé gé gé what the fuck");
  });

  it("préfère l'abréviation la plus longue quand l'une commence comme l'autre", () => {
    const longer = toPronunciations(["g = un", "gg = deux", "ggg = trois"]);
    expect(toSpokenText("g gg ggg", longer)).toBe("un deux trois");
  });

  it("ne remplace pas une forme parlée à son tour : un seul passage", () => {
    const chain = toPronunciations(["a = b", "b = c"]);
    expect(toSpokenText("a b", chain)).toBe("b c");
  });

  it("prend les caractères spéciaux de l'abréviation et de la forme dite à la lettre", () => {
    const special = toPronunciations(["c++ = cé plus plus", "a.b = point", "x = $& $1"]);
    expect(toSpokenText("du c++ ici", special)).toBe("du cé plus plus ici");
    expect(toSpokenText("a.b et aXb", special)).toBe("point et aXb");
    expect(toSpokenText("x", special)).toBe("$& $1");
  });

  it("ne touche pas au texte sans abréviation ni quand la liste est vide", () => {
    expect(toSpokenText("Bonjour tout le monde", list)).toBe("Bonjour tout le monde");
    expect(toSpokenText("wtf", [])).toBe("wtf");
    expect(toSpokenText("", list)).toBe("");
  });
});

describe("les prononciations par défaut de settings.json", () => {
  const defaults: { foxPronunciations?: string[] } = JSON.parse(readFileSync("settings.json", "utf8"));
  const lines = defaults.foxPronunciations ?? [];
  const spoken = (text: string) => toSpokenText(text, toPronunciations(lines));

  it("sont toutes des lignes valides, sans abréviation en double", () => {
    expect(lines.length).toBeGreaterThan(25);
    expect(lines.every((line) => toPronunciation(line) !== null)).toBe(true);
    expect(toPronunciations(lines)).toHaveLength(lines.length);
  });

  it("disent « wtf » « what the fuck », et « Merci Fenysk » « Merci Fénisque »", () => {
    expect(spoken("wtf")).toBe("what the fuck");
    expect(spoken("Merci Fenysk")).toBe("Merci Fénisque");
  });

  it("disent les abréviations du tchat comme elles se prononcent", () => {
    expect(spoken("omg")).toBe("oh my god");
    expect(spoken("mdr")).toBe("mort de rire");
    expect(spoken("ptdr")).toBe("pété de rire");
    expect(spoken("xd")).toBe("ha ha");
    expect(spoken("jpp")).toBe("j'en peux plus");
    expect(spoken("tkt")).toBe("t'inquiète");
    expect(spoken("stp svp")).toBe("s'il te plaît s'il vous plaît");
    expect(spoken("pk pq")).toBe("pourquoi pourquoi");
    expect(spoken("jsp")).toBe("je sais pas");
    expect(spoken("osef")).toBe("on s'en fout");
    expect(spoken("wsh bjr slt cc")).toBe("wesh bonjour salut coucou");
    expect(spoken("bg")).toBe("beau gosse");
    expect(spoken("gg ggwp ez")).toBe("gé gé good game well played easy");
    expect(spoken("brb btw idk irl")).toBe("je reviens by the way I don't know in real life");
    expect(spoken("mtn dsl jtm nvm")).toBe("maintenant désolé je t'aime never mind");
    expect(spoken("<3")).toBe("cœur");
  });

  it("ne changent pas une phrase sans abréviation", () => {
    expect(spoken("Bonjour tout le monde, super stream !")).toBe("Bonjour tout le monde, super stream !");
  });
});
