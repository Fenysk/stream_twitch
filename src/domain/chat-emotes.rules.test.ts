import { describe, expect, it } from "vitest";
import { toTextWithoutEmotes } from "./chat-emotes.rules";

describe("toTextWithoutEmotes : les emotes de Twitch", () => {
  it("retire l'emote repérée par ses positions, et garde le texte autour", () => {
    expect(toTextWithoutEmotes("Salut Kappa tout le monde", [{ id: "25", start: 6, end: 10 }], [])).toBe(
      "Salut tout le monde",
    );
  });

  it("retire plusieurs emotes, de la fin comme du début", () => {
    const ranges = [
      { id: "25", start: 0, end: 4 },
      { id: "25", start: 14, end: 18 },
    ];
    expect(toTextWithoutEmotes("Kappa bravo ! Kappa", ranges, [])).toBe("bravo !");
  });

  it("compte les positions en points de code : un emoji avant l'emote ne la décale pas", () => {
    expect(toTextWithoutEmotes("😀 Kappa ok", [{ id: "25", start: 2, end: 6 }], [])).toBe("😀 ok");
  });

  it("garde le texte quand les positions sont hors du message", () => {
    expect(toTextWithoutEmotes("Salut", [{ id: "25", start: 10, end: 14 }], [])).toBe("Salut");
  });

  it("rend une chaîne vide quand le message n'est que des emotes", () => {
    const ranges = [
      { id: "25", start: 0, end: 4 },
      { id: "25", start: 6, end: 10 },
    ];
    expect(toTextWithoutEmotes("Kappa Kappa", ranges, [])).toBe("");
  });
});

describe("toTextWithoutEmotes : les emotes de 7TV, BTTV et FFZ", () => {
  const names = ["OMEGALUL", "KEKW", "monkaS"];

  it("retire un mot de la liste, et garde le reste", () => {
    expect(toTextWithoutEmotes("c'est trop drôle OMEGALUL vraiment", [], names)).toBe(
      "c'est trop drôle vraiment",
    );
  });

  it("retire le mot même collé à de la ponctuation", () => {
    expect(toTextWithoutEmotes("KEKW! bravo monkaS?", [], names)).toBe("bravo");
  });

  it("respecte les majuscules : « kekw » n'est pas l'emote KEKW", () => {
    expect(toTextWithoutEmotes("kekw", [], names)).toBe("kekw");
  });

  it("ne retire pas un mot qui contient seulement un nom de la liste", () => {
    expect(toTextWithoutEmotes("MAKEKWA ok", [], names)).toBe("MAKEKWA ok");
  });

  it("rend une chaîne vide quand il ne reste que des emotes des deux sortes", () => {
    expect(toTextWithoutEmotes("Kappa KEKW OMEGALUL", [{ id: "25", start: 0, end: 4 }], names)).toBe("");
  });

  it("garde le texte sans changer les blancs utiles, et réduit les blancs répétés", () => {
    expect(toTextWithoutEmotes("  bonjour   à  tous ", [], names)).toBe("bonjour à tous");
  });
});
