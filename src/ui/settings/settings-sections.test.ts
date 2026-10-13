import { describe, expect, it } from "vitest";
import { SECTIONS } from "./settings-sections";

describe("les onglets du menu", () => {
  it("ouvrent Tête South Park, Découpe, Tchat et Renard, puis annoncent les suivants, dans l'ordre", () => {
    expect(SECTIONS.map(({ label }) => label)).toEqual([
      "Tête South Park",
      "Découpe",
      "Tchat",
      "Renard",
      "Évènements",
      "Points de chaîne",
      "Scènes",
      "Twitch",
    ]);
  });

  it("n'ont une route que pour les quatre premiers : les autres arrivent plus tard", () => {
    const withPath = SECTIONS.filter((section) => "path" in section).map(({ id }) => id);
    const soon = SECTIONS.filter((section) => "isSoon" in section).map(({ label }) => label);
    expect(withPath).toEqual(["head", "cut", "chat", "fox"]);
    expect(soon).toEqual(["Évènements", "Points de chaîne", "Scènes", "Twitch"]);
  });

  it("ont chacun un identifiant et une icône, sans doublon", () => {
    expect(new Set(SECTIONS.map(({ id }) => id)).size).toBe(SECTIONS.length);
    for (const { icon } of SECTIONS) expect(icon).toBeDefined();
  });
});
