import { describe, expect, it } from "vitest";
import { toSpamKind } from "./chat-spam.rules";

describe("toSpamKind : les répétitions", () => {
  it.each(["lol lol lol lol", "GG gg Gg gG", "non, non, non, non !", "ha ha ha ha ha ha"])(
    "reconnaît un mot répété quatre fois ou plus : %s",
    (text) => {
      expect(toSpamKind(text)).toBe("repetition");
    },
  );

  it("laisse passer un mot dit trois fois, ou répété dans une vraie phrase", () => {
    expect(toSpamKind("oui oui oui")).toBeNull();
    expect(toSpamKind("je suis là, tu es là, il est là, on est tous là")).toBeNull();
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
    expect(toSpamKind(text)).toBe("letters");
  });

  it("laisse passer un mot allongé jusqu'à cinq lettres", () => {
    expect(toSpamKind("loooool")).toBeNull();
    expect(toSpamKind("nooooon")).toBeNull();
    expect(toSpamKind("ouiiii")).toBeNull();
  });
});

describe("toSpamKind : les majuscules en rafale", () => {
  it("reconnaît un message presque entier en majuscules, à partir de dix lettres", () => {
    expect(toSpamKind("SALUT TOUT LE MONDE")).toBe("capitals");
    expect(toSpamKind("REGARDEZ MOI ÇA VITE")).toBe("capitals");
  });

  it("laisse passer un cri court, des sigles et une phrase normale", () => {
    expect(toSpamKind("GG")).toBeNull();
    expect(toSpamKind("OUI OUI")).toBeNull();
    expect(toSpamKind("Je joue sur PC avec une RTX")).toBeNull();
    expect(toSpamKind("Salut Fenysk, la forme ?")).toBeNull();
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
    expect(toSpamKind(text)).toBe("drawing");
  });

  it("laisse passer une phrase ponctuée et un smiley", () => {
    expect(toSpamKind("Bonjour, ça va ? Oui, très bien !")).toBeNull();
    expect(toSpamKind("trop bien :)")).toBeNull();
    expect(toSpamKind("quoi ?! sérieux ?!")).toBeNull();
  });
});
