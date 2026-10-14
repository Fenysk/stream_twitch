import { describe, expect, it } from "vitest";
import { type EmoteReaction, toEmoteReaction, toEmoteReactions, toReaction } from "./reaction.rules";

describe("toReaction : le sourire (gg, <3, Jean-Renard)", () => {
  it.each([
    "gg",
    "GG",
    "gg wp",
    "gg !",
    "bravo, gg à toi",
    "(gg)",
    "Gg.",
    "je t'aime <3",
    "<3",
    "trop bien <3 <3",
    "Jean-Renard",
    "salut Jean-Renard !",
    "jean renard",
    "JEAN RENARD",
    "JEANRENARD",
    "jeanrenard",
    "Jean_Renard",
    "jean   -   renard",
    "Jean-Renârd",
    "coucou jean renard comment ça va",
  ])("donne le sourire : %s", (text) => {
    expect(toReaction(text)).toBe("front-smile-rest");
  });

  it.each([
    "eggs",
    "eggplant",
    "ggwp",
    "aggregate",
    "bigg",
    "g g",
    "jean",
    "renard",
    "le renard de Jean",
    "salut les amis",
  ])("ne donne pas le sourire : %s", (text) => {
    expect(toReaction(text)).toBeNull();
  });
});

describe("toReaction : le choc (?!)", () => {
  it.each(["quoi ?!", "?!", "sérieux ?! incroyable", "hein?!?!"])("donne le choc : %s", (text) => {
    expect(toReaction(text)).toBe("left-large-rest");
  });

  it.each(["quoi ?", "quoi !", "quoi !?", "vraiment ? !", "bonjour"])("ne donne pas le choc : %s", (text) => {
    expect(toReaction(text)).toBeNull();
  });
});

describe("toReaction : le clin d'œil (;) et 😉)", () => {
  it.each(["on se retrouve ;)", ";)", "chut ;) tais-toi", "bien joué 😉", "😉", "ok😉ok"])(
    "donne le clin d'œil : %s",
    (text) => {
      expect(toReaction(text)).toBe("wink-tongue-rest");
    },
  );

  it.each(["trop bien :)", ";(", "(;", "salut", "😀"])("ne donne pas le clin d'œil : %s", (text) => {
    expect(toReaction(text)).toBeNull();
  });
});

describe("toReaction : plusieurs mots-clés, l'ordre du CDC", () => {
  it("donne le sourire avant le choc et le clin d'œil", () => {
    expect(toReaction("gg ?!")).toBe("front-smile-rest");
    expect(toReaction("gg ;)")).toBe("front-smile-rest");
    expect(toReaction("<3 ?! ;)")).toBe("front-smile-rest");
    expect(toReaction("Jean-Renard ?! ;)")).toBe("front-smile-rest");
  });

  it("donne le choc avant le clin d'œil", () => {
    expect(toReaction("quoi ?! ;)")).toBe("left-large-rest");
    expect(toReaction("😉 vraiment ?!")).toBe("left-large-rest");
  });

  it("ne donne rien sans mot-clé : il lit tout de suite", () => {
    expect(toReaction("Bonjour tout le monde")).toBeNull();
    expect(toReaction("")).toBeNull();
  });
});

describe("toEmoteReaction : une ligne du réglage", () => {
  it("lit le nom de l'emote et sa réaction : sourire, choc ou clin", () => {
    expect(toEmoteReaction("LUL = sourire")).toEqual({ name: "LUL", image: "front-smile-rest" });
    expect(toEmoteReaction("WutFace = choc")).toEqual({ name: "WutFace", image: "left-large-rest" });
    expect(toEmoteReaction("Kappa = clin")).toEqual({ name: "Kappa", image: "wink-tongue-rest" });
  });

  it("accepte « clin d'œil » aussi, sans tenir compte des majuscules ni des espaces autour", () => {
    expect(toEmoteReaction("Kappa=Clin d'œil")?.image).toBe("wink-tongue-rest");
    expect(toEmoteReaction("Kappa = clin d'oeil")?.image).toBe("wink-tongue-rest");
    expect(toEmoteReaction("  LUL   =   SOURIRE  ")).toEqual({ name: "LUL", image: "front-smile-rest" });
  });

  it("garde les majuscules du nom : l'emote s'écrit exactement", () => {
    expect(toEmoteReaction("monkaS = choc")?.name).toBe("monkaS");
  });

  it("lit le nom jusqu'au dernier signe égal : une emote peut en contenir un", () => {
    expect(toEmoteReaction("=) = sourire")).toEqual({ name: "=)", image: "front-smile-rest" });
  });

  it.each([
    "LUL",
    "LUL =",
    "= sourire",
    "LUL = triste",
    "LUL = toString",
    "LUL = constructor",
    "deux mots = sourire",
    "",
    "   ",
  ])("refuse la ligne : « %s »", (line) => {
    expect(toEmoteReaction(line)).toBeNull();
  });
});

describe("toEmoteReactions : la liste du réglage", () => {
  it("lit chaque ligne, ignore celles qui sont illisibles, et garde la première ligne d'une emote", () => {
    expect(toEmoteReactions(["LUL = sourire", "n'importe quoi", "LUL = choc", "Kappa = clin"])).toEqual([
      { name: "LUL", image: "front-smile-rest" },
      { name: "Kappa", image: "wink-tongue-rest" },
    ]);
  });

  it("est vide sans réglage", () => {
    expect(toEmoteReactions(undefined)).toEqual([]);
    expect(toEmoteReactions([])).toEqual([]);
  });
});

describe("toReaction : les emotes de la liste valent un mot-clé", () => {
  const emotes: EmoteReaction[] = [
    { name: "LUL", image: "front-smile-rest" },
    { name: "WutFace", image: "left-large-rest" },
    { name: "Kappa", image: "wink-tongue-rest" },
  ];

  it("donne la réaction de l'emote qu'un message contient, seule ou dans une phrase", () => {
    expect(toReaction("LUL", emotes)).toBe("front-smile-rest");
    expect(toReaction("trop drôle LUL vraiment", emotes)).toBe("front-smile-rest");
    expect(toReaction("WutFace", emotes)).toBe("left-large-rest");
    expect(toReaction("Kappa Kappa Kappa", emotes)).toBe("wink-tongue-rest");
  });

  it("cherche le nom exact, majuscules comprises, et en mot entier", () => {
    expect(toReaction("lul", emotes)).toBeNull();
    expect(toReaction("Lul", emotes)).toBeNull();
    expect(toReaction("LULW", emotes)).toBeNull();
    expect(toReaction("xLUL", emotes)).toBeNull();
    expect(toReaction("LUL,", emotes)).toBeNull();
  });

  it("ne donne rien avec une emote hors de la liste, ni sans liste", () => {
    expect(toReaction("PogU", emotes)).toBeNull();
    expect(toReaction("LUL")).toBeNull();
    expect(toReaction("LUL", [])).toBeNull();
  });

  it("garde l'ordre du CDC entre emotes et mots-clés : sourire, puis choc, puis clin d'œil", () => {
    expect(toReaction("Kappa WutFace LUL", emotes)).toBe("front-smile-rest");
    expect(toReaction("Kappa WutFace", emotes)).toBe("left-large-rest");
    expect(toReaction("Kappa gg", emotes)).toBe("front-smile-rest");
    expect(toReaction("LUL ?!", emotes)).toBe("front-smile-rest");
    expect(toReaction("WutFace ;)", emotes)).toBe("left-large-rest");
    expect(toReaction("Kappa ?!", emotes)).toBe("left-large-rest");
    expect(toReaction("Kappa", emotes)).toBe("wink-tongue-rest");
  });

  it("laisse les mots-clés d'avant tels quels", () => {
    expect(toReaction("gg", emotes)).toBe("front-smile-rest");
    expect(toReaction("quoi ?!", emotes)).toBe("left-large-rest");
    expect(toReaction("bien joué ;)", emotes)).toBe("wink-tongue-rest");
  });
});
