import { describe, expect, it } from "vitest";
import { toSpamKind } from "./chat-spam.rules";

// La valeur par défaut de `foxCapitalsMaxLength` (settings.json).
const CAPITALS_MAX = 15;

describe("toSpamKind : les répétitions", () => {
  it.each(["lol lol lol lol", "GG gg Gg gG", "non, non, non, non !", "ha ha ha ha ha ha"])(
    "reconnaît un mot répété quatre fois ou plus : %s",
    (text) => {
      expect(toSpamKind(text, CAPITALS_MAX)).toBe("repetition");
    },
  );

  it("laisse passer un mot dit trois fois, ou répété dans une vraie phrase", () => {
    expect(toSpamKind("oui oui oui", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("je suis là, tu es là, il est là, on est tous là", CAPITALS_MAX)).toBeNull();
  });
});

describe("toSpamKind : les lettres répétées", () => {
  it.each([
    "aaaaaaaaa",
    "noooooooon",
    "!!!!!!!!",
    "ouiiiiiiii",
    "mdrrrrrrr",
    "ptdrrrrrrrrr",
    "hahahaaaaaaaa",
  ])("reconnaît six caractères identiques de suite : %s", (text) => {
    expect(toSpamKind(text, CAPITALS_MAX)).toBe("letters");
  });

  it("laisse passer un mot allongé jusqu'à cinq lettres", () => {
    expect(toSpamKind("loooool", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("nooooon", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("ouiiii", CAPITALS_MAX)).toBeNull();
  });
});

describe("toSpamKind : les majuscules en rafale", () => {
  it("reconnaît un message presque entier en majuscules, à partir de dix lettres", () => {
    expect(toSpamKind("SALUT TOUT LE MONDE", CAPITALS_MAX)).toBe("capitals");
    expect(toSpamKind("REGARDEZ MOI ÇA VITE", CAPITALS_MAX)).toBe("capitals");
  });

  it("laisse passer un cri court, des sigles et une phrase normale", () => {
    expect(toSpamKind("GG", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("OUI OUI", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("Je joue sur PC avec une RTX", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("Salut Fenysk, la forme ?", CAPITALS_MAX)).toBeNull();
  });
});

describe("toSpamKind : un message court en majuscules", () => {
  it.each(["GG", "MDR", "JEANRENARD", "JEAN RENARD", "ABCDEFGHIJKLMNO"])(
    "passe la règle des majuscules à 15 caractères ou moins : %s",
    (text) => {
      expect(Array.from(text).length).toBeLessThanOrEqual(15);
      expect(toSpamKind(text, CAPITALS_MAX)).toBeNull();
    },
  );

  it("reste du spam dès le seizième caractère", () => {
    expect(toSpamKind("ABCDEFGHIJKLMNOP", CAPITALS_MAX)).toBe("capitals");
  });

  it("suit le maximum réglé", () => {
    expect(toSpamKind("JEANRENARD", 5)).toBe("capitals");
    expect(toSpamKind("JEANRENARD", 10)).toBeNull();
    expect(toSpamKind("SALUT TOUT LE MONDE", 30)).toBeNull();
  });

  it("garde les autres règles pour un message court", () => {
    expect(toSpamKind("GG GG GG GG", CAPITALS_MAX)).toBe("repetition");
    expect(toSpamKind("GGGGGGGG", CAPITALS_MAX)).toBe("letters");
    expect(toSpamKind("⣿⣿⣿⣿⣿⣿", CAPITALS_MAX)).toBe("drawing");
  });
});

describe("toSpamKind : les dessins en caractères", () => {
  it.each([
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "▓▓▓▓░░░░▓▓▓▓",
    "╔═══╗ ║ X ║ ╚═══╝",
    "( ͡° ͜ʖ ͡°) ( ͡° ͜ʖ ͡°)",
    "-_-_-_-_-_-_-_-",
    "/\\/\\/\\/\\/\\/\\",
    "<<<<--->>>>",
    "(\\_/) (o.o) (> <)",
  ])("reconnaît un dessin : %s", (text) => {
    expect(toSpamKind(text, CAPITALS_MAX)).toBe("drawing");
  });

  it("laisse passer une phrase ponctuée et un smiley", () => {
    expect(toSpamKind("Bonjour, ça va ? Oui, très bien !", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("trop bien :)", CAPITALS_MAX)).toBeNull();
    expect(toSpamKind("quoi ?! sérieux ?!", CAPITALS_MAX)).toBeNull();
  });
});
