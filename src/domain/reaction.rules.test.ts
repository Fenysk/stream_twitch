import { describe, expect, it } from "vitest";
import { toReaction } from "./reaction.rules";

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
