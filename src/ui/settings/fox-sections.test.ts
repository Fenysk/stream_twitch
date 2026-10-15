import { describe, expect, it } from "vitest";
import { FOX_SECTION_IDS } from "../../domain/fox-section.schema";
import { FOX_GROUPS } from "./fox-fields";
import { CHAT_READING_CARD, FOX_SECTION_CHOICES, FOX_SECTIONS, VOICE_CARD } from "./fox-sections";

const allCards = FOX_SECTION_IDS.flatMap((id) => FOX_SECTIONS[id].cards);

describe("les sous-onglets du renard", () => {
  it("s'appellent Voix, Corps, Écoute, Évènements et Réactions, dans cet ordre", () => {
    expect(FOX_SECTION_CHOICES.map(({ label }) => label)).toEqual([
      "Voix",
      "Corps",
      "Écoute",
      "Évènements",
      "Réactions",
    ]);
    expect(FOX_SECTION_CHOICES.map(({ value }) => value)).toEqual([...FOX_SECTION_IDS]);
  });

  it("rangent chaque groupe de réglages dans exactement un sous-onglet", () => {
    for (const { title } of FOX_GROUPS) {
      expect(allCards.filter((card) => card === title)).toHaveLength(1);
    }
  });

  it("rangent la carte Voix et la carte Lecture du tchat, écrites à la main, une seule fois chacune", () => {
    expect(allCards.filter((card) => card === VOICE_CARD)).toHaveLength(1);
    expect(allCards.filter((card) => card === CHAT_READING_CARD)).toHaveLength(1);
  });

  it("n'écrivent aucune carte qui n'existe pas, et aucune deux fois", () => {
    const known = [VOICE_CARD, CHAT_READING_CARD, ...FOX_GROUPS.map(({ title }) => title)];
    expect(allCards.filter((card) => !known.includes(card))).toEqual([]);
    expect(new Set(allCards).size).toBe(allCards.length);
    expect(allCards).toHaveLength(known.length);
  });

  it("ne laissent aucun sous-onglet vide", () => {
    for (const id of FOX_SECTION_IDS) expect(FOX_SECTIONS[id].cards.length).toBeGreaterThan(0);
  });

  it("répartissent les cartes comme prévu : la voix, le corps, l'écoute, les évènements, les réactions", () => {
    expect(FOX_SECTIONS.voice.cards).toEqual([VOICE_CARD, "Prononciation"]);
    expect(FOX_SECTIONS.body.cards).toEqual([
      "Quand il parle",
      "Au repos",
      "Clignement",
      "Quand il s'ennuie",
    ]);
    expect(FOX_SECTIONS.listening.cards).toEqual([
      "Quand tu parles",
      "Réaction et coucou",
      CHAT_READING_CARD,
      "Relance",
    ]);
    expect(FOX_SECTIONS.events.cards).toEqual([
      "Remerciements",
      "Récompenses de points de chaîne",
      "Habitués",
      "Heure du live",
    ]);
    expect(FOX_SECTIONS.reactions.cards).toEqual([
      "Humeur du tchat",
      "Quand tu cries",
      "Quand tu parles longtemps",
      "Quand tu reviens",
      "Balance du son",
      "Quand le jeu explose",
    ]);
  });
});
