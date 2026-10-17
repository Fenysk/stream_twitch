import { describe, expect, it } from "vitest";
import { SECTION_GROUPS, SECTIONS, toCurrentSectionId, toSectionLabel } from "./settings-sections";

describe("les onglets du menu", () => {
  it("ouvrent Direct, Tête South Park, Découpe, Tchat, Renard, Points de chaîne, Émission et Twitch, puis annoncent les suivants, dans l'ordre", () => {
    expect(SECTIONS.map(({ label }) => label)).toEqual([
      "Direct",
      "Tête South Park",
      "Découpe",
      "Tchat",
      "Renard",
      "Points de chaîne",
      "Émission",
      "Twitch",
      "Évènements",
      "Scènes",
    ]);
  });

  it("n'ont une route que pour les huit premiers : les autres arrivent plus tard", () => {
    const withPath = SECTIONS.filter((section) => "path" in section).map(({ id }) => id);
    const soon = SECTIONS.filter((section) => "isSoon" in section).map(({ label }) => label);
    expect(withPath).toEqual(["live", "head", "cut", "chat", "fox", "rewards", "show", "twitch"]);
    expect(soon).toEqual(["Évènements", "Scènes"]);
  });

  it("ont chacun un identifiant et une icône, sans doublon", () => {
    expect(new Set(SECTIONS.map(({ id }) => id)).size).toBe(SECTIONS.length);
    for (const { icon } of SECTIONS) expect(icon).toBeDefined();
  });
});

describe("les groupes du menu", () => {
  const filled = SECTION_GROUPS.filter(({ sections }) => sections.length > 0);

  it("rangent Direct, les sources OBS (Points de chaîne après Renard, puis Émission), le compte Twitch, puis les onglets annoncés « Bientôt »", () => {
    expect(filled.map(({ label }) => label)).toEqual(["En direct", "Sources OBS", "Compte", "Bientôt"]);
    expect(filled[0]?.sections.map(({ label }) => label)).toEqual(["Direct"]);
    expect(filled[1]?.sections.map(({ label }) => label)).toEqual([
      "Tête South Park",
      "Découpe",
      "Tchat",
      "Renard",
      "Points de chaîne",
      "Émission",
    ]);
    expect(filled[2]?.sections.map(({ label }) => label)).toEqual(["Twitch"]);
    expect(filled[3]?.sections.map(({ label }) => label)).toEqual(["Évènements", "Scènes"]);
  });

  it("mettent « En direct » avant les sources, ne laissent aucun groupe vide, et laissent « Bientôt » en bas", () => {
    expect(SECTION_GROUPS.map(({ label }) => label)).toEqual([
      "En direct",
      "Sources OBS",
      "Compte",
      "Bientôt",
    ]);
    const empty = SECTION_GROUPS.filter(({ sections }) => sections.length < 1);
    expect(empty.map(({ label }) => label)).toEqual([]);
  });

  it("ne mettent un onglet qui mène quelque part que hors de « Bientôt », et seulement là un onglet annoncé", () => {
    const [live, sources, account, soon] = filled;
    expect(live?.sections.every((section) => "path" in section)).toBe(true);
    expect(sources?.sections.every((section) => "path" in section)).toBe(true);
    expect(account?.sections.every((section) => "path" in section)).toBe(true);
    expect(soon?.sections.every((section) => "isSoon" in section)).toBe(true);
  });

  it("donnent la liste à plat SECTIONS : chaque onglet une seule fois, dans l'ordre des groupes", () => {
    expect(SECTIONS.map(({ id }) => id)).toEqual(
      SECTION_GROUPS.flatMap(({ sections }) => sections.map(({ id }) => id)),
    );
    expect(new Set(SECTION_GROUPS.map(({ id }) => id)).size).toBe(SECTION_GROUPS.length);
  });
});

describe("le titre d'une page", () => {
  it("est le libellé de son onglet dans le menu", () => {
    expect(toSectionLabel("live")).toBe("Direct");
    expect(toSectionLabel("head")).toBe("Tête South Park");
    expect(toSectionLabel("cut")).toBe("Découpe");
    expect(toSectionLabel("chat")).toBe("Tchat");
    expect(toSectionLabel("fox")).toBe("Renard");
    expect(toSectionLabel("rewards")).toBe("Points de chaîne");
    expect(toSectionLabel("show")).toBe("Émission");
    expect(toSectionLabel("twitch")).toBe("Twitch");
  });
});

describe("l'onglet d'une adresse", () => {
  it("donne Direct pour /settings et /settings/, l'index, et seulement eux", () => {
    expect(toCurrentSectionId("/settings")).toBe("live");
    expect(toCurrentSectionId("/settings/")).toBe("live");
  });

  it("garde chaque autre onglet pour son adresse : /settings/head reste Tête, malgré le début commun avec l'index", () => {
    expect(toCurrentSectionId("/settings/head")).toBe("head");
    expect(toCurrentSectionId("/settings/cut")).toBe("cut");
    expect(toCurrentSectionId("/settings/chat")).toBe("chat");
    expect(toCurrentSectionId("/settings/fox")).toBe("fox");
    expect(toCurrentSectionId("/settings/show")).toBe("show");
    expect(toCurrentSectionId("/settings/twitch")).toBe("twitch");
  });

  it("ignore la barre finale d'une adresse d'onglet", () => {
    expect(toCurrentSectionId("/settings/head/")).toBe("head");
    expect(toCurrentSectionId("/settings/fox/")).toBe("fox");
  });

  it("retombe sur Direct pour une adresse qui n'est celle d'aucun onglet", () => {
    expect(toCurrentSectionId("/settings/nimportequoi")).toBe("live");
    expect(toCurrentSectionId("/settings/head/autre")).toBe("live");
  });

  it("donne à Direct l'adresse de l'index", () => {
    const live = SECTIONS.find(({ id }) => id === "live");
    expect(live && "path" in live ? live.path : undefined).toBe("/settings");
  });
});
