import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import { RewardPhrasesRow } from "./reward-phrases-row";
import { RewardPhrasesSection } from "./reward-phrases-section";
import type { UseRewardPhrases } from "./use-reward-phrases";

const entry: RewardPhrasesEntry = {
  id: "reward-drink",
  title: "À boire <b>!</b>",
  isMissing: false,
  isReserved: false,
  phrases: ["Bois un coup de la part de {user} !", "Santé, {user} !"],
};

const renderRow = (overrides: Partial<RewardPhrasesEntry> = {}): string =>
  renderToStaticMarkup(
    createElement(RewardPhrasesRow, {
      entry: { ...entry, ...overrides },
      onSave: async () => null,
      onTest: async () => null,
    }),
  );

const section = (overrides: Partial<UseRewardPhrases> = {}): UseRewardPhrases => ({
  rewards: [entry],
  error: null,
  isLoading: false,
  refresh: async () => undefined,
  save: async () => null,
  test: async () => null,
  ...overrides,
});

const renderSection = (overrides: Partial<UseRewardPhrases> = {}): string =>
  renderToStaticMarkup(createElement(RewardPhrasesSection, { phrases: section(overrides) }));

describe("une récompense et ses phrases de Jean-Renard", () => {
  it("montre son titre (jamais comme du HTML) et ses phrases, une par ligne, avec la variable permise", () => {
    const html = renderRow();
    expect(html).toContain("À boire &lt;b&gt;!&lt;/b&gt;");
    expect(html).not.toContain("<b>!</b>");
    expect(html).toContain("Phrases de Jean-Renard");
    expect(html).toContain("Bois un coup de la part de {user} !\nSanté, {user} !");
    expect(html).toContain("Variables : {user}");
  });

  it("propose « Tester » quand elle a des phrases, éteint sinon", () => {
    expect(renderRow()).toMatch(/<button(?![^>]*disabled)[^>]*>.*Tester/);
    expect(renderRow({ phrases: [] })).toMatch(/<button[^>]*disabled[^>]*>.*Tester/);
  });

  it("badge « Pas sur Twitch » une récompense disparue : ses phrases restent", () => {
    expect(renderRow()).not.toContain("Pas sur Twitch");
    const html = renderRow({ isMissing: true });
    expect(html).toContain("Pas sur Twitch");
    expect(html).toContain("Cette récompense n&#x27;existe plus sur Twitch");
    expect(html).toContain("Santé, {user} !");
  });

  it("renvoie à l'onglet Renard pour une récompense du renard : ni champ de phrases, ni « Tester »", () => {
    const html = renderRow({ isReserved: true, phrases: [] });
    expect(html).toContain("Phrases réglées dans l&#x27;onglet Renard");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Tester");
  });
});

describe("la section des phrases de Jean-Renard", () => {
  it("liste chaque récompense de la chaîne, sans son comprise, et dit ce que {user} devient", () => {
    const html = renderSection({
      rewards: [entry, { ...entry, id: "reward-stretch", title: "Étirement !", phrases: [] }],
    });
    expect(html).toContain("Phrases de Jean-Renard");
    expect(html).toContain("devient le nickname du viewer");
    expect(html).toContain("Étirement !");
    expect(html).toContain('aria-label="Récompenses de la chaîne"');
  });

  it("dit pourquoi la liste manque quand Twitch ne l'a pas donnée, sans rien lister", () => {
    const html = renderSection({ rewards: null, error: "la connexion à Twitch n'est pas prête" });
    expect(html).toContain("la connexion à Twitch n&#x27;est pas prête");
    expect(html).not.toContain("<ul");
  });

  it("dit qu'une chaîne sans récompense n'a rien à lister", () => {
    expect(renderSection({ rewards: [] })).toContain("Aucune récompense sur la chaîne");
  });
});
