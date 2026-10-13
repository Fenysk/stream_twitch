import { describe, expect, it } from "vitest";
import { toTextWithoutCheermotes } from "./cheermote.rules";

describe("toTextWithoutCheermotes", () => {
  it("remplace un cheermote par autant d'espaces, et laisse le reste du message", () => {
    expect(toTextWithoutCheermotes("Cheer100 bravo pour le stream")).toBe("         bravo pour le stream");
    expect(toTextWithoutCheermotes("bravo Cheer100")).toBe("bravo         ");
  });

  it("garde la longueur du message : les positions des emotes de Twitch restent valables", () => {
    const text = "Kappa1000 gg Cheer5000 Kappa Party100 !";
    expect(Array.from(toTextWithoutCheermotes(text))).toHaveLength(Array.from(text).length);
    expect(toTextWithoutCheermotes(text).indexOf("Kappa Party100")).toBe(-1);
    expect(toTextWithoutCheermotes(text).indexOf("Kappa ")).toBe(text.indexOf("Kappa "));
  });

  it("reconnaît les préfixes courants, sans tenir compte des majuscules", () => {
    for (const word of [
      "cheer1",
      "CHEER10000",
      "Kappa100",
      "4Head100",
      "Streamlabs100",
      "BibleThump1000",
      "DansGame1",
    ]) {
      expect(toTextWithoutCheermotes(word).trim(), word).toBe("");
    }
  });

  it("reconnaît un cheermote collé à de la ponctuation", () => {
    expect(toTextWithoutCheermotes("(Cheer100) merci!").trim()).toBe("merci!");
  });

  it("laisse un mot qui n'est pas un cheermote : sans nombre, ou avec un préfixe inconnu", () => {
    for (const text of ["Cheer", "Cheers100", "mp3", "abc123", "Kappa", "gg100", "100Cheer", "Cheer100x"]) {
      expect(toTextWithoutCheermotes(text), text).toBe(text);
    }
  });

  it("enlève plusieurs cheermotes d'un même message", () => {
    expect(toTextWithoutCheermotes("Cheer100 Cheer100 Cheer100").trim()).toBe("");
  });

  it("ne change pas un message sans cheermote", () => {
    expect(toTextWithoutCheermotes("Bonjour tout le monde")).toBe("Bonjour tout le monde");
    expect(toTextWithoutCheermotes("")).toBe("");
  });
});
