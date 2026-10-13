import { describe, expect, it } from "vitest";
import { toContactKind } from "./chat-contact.rules";

describe("toContactKind : les liens", () => {
  it.each([
    "va voir https://exemple.com/promo",
    "http://exemple.fr",
    "HTTPS://EXEMPLE.COM",
    "regardez www.exemple.fr c'est bien",
    "clique ici twitch.tv/quelquun",
    "mon site : promo-gratuite.xyz",
    "venez sur discord.gg/abcdef",
    "bit.ly/3abc",
    "exemple . com",
    "exemple[.]com",
    "exemple (dot) com",
    "exemple dot com",
  ])("reconnaît un lien : %s", (text) => {
    expect(toContactKind(text)).toBe("link");
  });

  it.each([
    "salut tout le monde",
    "c'est la fin.Merci à tous",
    "ok.ca va",
    "version 2.5 sortie hier",
    "M. Dupont est là. Bonjour",
    "à 20h.On se retrouve",
  ])("laisse passer une phrase ordinaire : %s", (text) => {
    expect(toContactKind(text)).toBeNull();
  });
});

describe("toContactKind : les adresses mail", () => {
  it.each(["écris-moi à jean.dupont@gmail.com", "x_y+z@exemple.fr", "contact@sous.domaine.org"])(
    "reconnaît une adresse : %s",
    (text) => {
      expect(toContactKind(text)).toBe("email");
    },
  );

  it("reconnaît l'adresse écrite en toutes lettres", () => {
    expect(toContactKind("jean arobase gmail point com")).toBe("email");
  });

  it("laisse passer une mention de viewer", () => {
    expect(toContactKind("@fenysk bien joué")).toBeNull();
  });
});

describe("toContactKind : les numéros de téléphone", () => {
  it.each([
    "appelle le 06 12 34 56 78",
    "0612345678",
    "06.12.34.56.78",
    "+33 6 12 34 56 78",
    "06-12-34-56-78 vite",
    "+1 (555) 123-4567",
  ])("reconnaît un numéro : %s", (text) => {
    expect(toContactKind(text)).toBe("phone");
  });

  it.each([
    "j'ai 20 ans",
    "il reste 3 chances sur 10",
    "score de 1234",
    "le 12 05 2024",
    "niveau 99 atteint",
  ])("laisse passer des chiffres ordinaires : %s", (text) => {
    expect(toContactKind(text)).toBeNull();
  });
});
