import { describe, expect, it } from "vitest";
import { toInsultList } from "./chat-insults.rules";
import { toSpokenMentions } from "./chat-mentions.rules";

const insults = toInsultList("connard\nsalope\n=con\n=pd");

describe("toSpokenMentions : une mention qui ouvre le message", () => {
  it("perd son arobase et reçoit une virgule", () => {
    expect(toSpokenMentions("@Benitoad t'as vu ça ?", insults)).toEqual({
      text: "Benitoad, t'as vu ça ?",
      insult: null,
    });
  });

  it("ne reçoit pas de seconde virgule quand une ponctuation la suit déjà", () => {
    expect(toSpokenMentions("@Benitoad, t'as vu ça ?", insults).text).toBe("Benitoad, t'as vu ça ?");
    expect(toSpokenMentions("@Benitoad: salut", insults).text).toBe("Benitoad: salut");
    expect(toSpokenMentions("@Benitoad! salut", insults).text).toBe("Benitoad! salut");
  });

  it("reçoit une virgule chacune quand plusieurs mentions ouvrent le message", () => {
    expect(toSpokenMentions("@Benitoad @Fenysk salut", insults).text).toBe("Benitoad, Fenysk, salut");
  });

  it("n'a pas de virgule quand rien ne la suit", () => {
    expect(toSpokenMentions("@Benitoad", insults).text).toBe("Benitoad");
    expect(toSpokenMentions("@Benitoad @Fenysk", insults).text).toBe("Benitoad, Fenysk");
  });

  it("accepte les chiffres, les tirets bas et les lettres accentuées d'un nickname", () => {
    expect(toSpokenMentions("@Mr_Toad9 salut", insults).text).toBe("Mr_Toad9, salut");
    expect(toSpokenMentions("@Éloïse salut", insults).text).toBe("Éloïse, salut");
  });
});

describe("toSpokenMentions : une mention au milieu ou à la fin", () => {
  it("perd seulement son arobase", () => {
    expect(toSpokenMentions("merci @Benitoad", insults).text).toBe("merci Benitoad");
    expect(toSpokenMentions("merci @Benitoad pour le sub", insults).text).toBe("merci Benitoad pour le sub");
  });

  it("garde la ponctuation collée à la mention", () => {
    expect(toSpokenMentions("bravo @Benitoad!", insults).text).toBe("bravo Benitoad!");
    expect(toSpokenMentions("bravo @Benitoad !", insults).text).toBe("bravo Benitoad !");
  });

  it("ne touche pas une mention qui suit un mot : la virgule n'est que pour l'ouverture", () => {
    expect(toSpokenMentions("salut @Benitoad @Fenysk", insults).text).toBe("salut Benitoad Fenysk");
  });
});

describe("toSpokenMentions : ce qui n'est pas une mention", () => {
  it.each(["salut tout le monde", "écris à jean@exemple", "tu es @ la ramasse", "@", "a @@ b"])(
    "laisse tel quel : %s",
    (text) => {
      expect(toSpokenMentions(text, insults)).toEqual({ text, insult: null });
    },
  );

  it("laisse tel quel un nickname de plus de 25 caractères : Twitch n'en donne pas", () => {
    const text = `@${"a".repeat(26)} salut`;
    expect(toSpokenMentions(text, insults).text).toBe(text);
  });
});

describe("toSpokenMentions : un nickname cité que le filtre d'insultes refuse", () => {
  it("est retiré du texte lu, et l'entrée de la liste est dite", () => {
    expect(toSpokenMentions("@connard salut", insults)).toEqual({ text: "salut", insult: "connard" });
    expect(toSpokenMentions("merci @xX_connard_Xx", insults)).toEqual({ text: "merci", insult: "connard" });
  });

  it("laisse la mention suivante ouvrir le message", () => {
    expect(toSpokenMentions("@connard @Benitoad salut", insults).text).toBe("Benitoad, salut");
  });

  it("ne laisse pas de virgule à la dernière mention quand il ne reste rien derrière elle", () => {
    expect(toSpokenMentions("@Benitoad @connard", insults).text).toBe("Benitoad");
  });

  it("vide le texte quand le message n'était que ce nickname", () => {
    expect(toSpokenMentions("@connard", insults)).toEqual({ text: "", insult: "connard" });
  });

  it("ne juge que les nicknames cités : le reste du message est pour le filtre", () => {
    expect(toSpokenMentions("quel connard @Benitoad", insults)).toEqual({
      text: "quel connard Benitoad",
      insult: null,
    });
  });
});
