import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import { RewardPhrasesRow } from "./reward-phrases-row";

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

describe("les phrases de Jean-Renard d'une récompense", () => {
  it("montre ses phrases, une par ligne, avec la variable permise", () => {
    const html = renderRow();
    expect(html).toContain("Phrases de Jean-Renard");
    expect(html).toContain("<textarea");
    expect(html).toContain("Bois un coup de la part de {user} !\nSanté, {user} !");
    expect(html).toContain("Variables : {user}");
  });

  it("n'est pas une ligne de la liste et ne répète pas le titre : la ligne de la récompense les porte", () => {
    const html = renderRow();
    expect(html).not.toContain("<li");
    expect(html).not.toContain("À boire");
    expect(html).not.toContain("<b>!</b>");
  });

  it("propose « Tester » quand elle a des phrases, éteint sinon", () => {
    expect(renderRow()).toMatch(/<button(?![^>]*disabled)[^>]*>.*Tester/);
    expect(renderRow({ phrases: [] })).toMatch(/<button[^>]*disabled[^>]*>.*Tester/);
    expect(renderRow({ phrases: [] })).toContain("<textarea");
  });

  it("garde les phrases d'une récompense disparue de Twitch : elles se montrent et se modifient encore", () => {
    const html = renderRow({ isMissing: true });
    expect(html).toContain("Santé, {user} !");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("Pas sur Twitch");
  });

  it("renvoie à l'onglet Renard pour une récompense du renard : ni champ de phrases, ni « Tester »", () => {
    const html = renderRow({ isReserved: true, phrases: [] });
    expect(html).toContain("Phrases réglées dans l&#x27;onglet Renard");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Tester");
  });

  it("n'a pas non plus de champ pour une récompense du renard qui garde des phrases d'avant", () => {
    const html = renderRow({ isReserved: true });
    expect(html).toContain("Phrases réglées dans l&#x27;onglet Renard");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Santé");
  });

  it("explique le tirage au sort, et que la phrase part après le son quand la récompense en a un", () => {
    const html = renderRow();
    expect(html).toContain("Une phrase par ligne, tirée au hasard à chaque rachat");
    expect(html).toContain("Avec un son, elle part quand il se termine");
    expect(html).toContain("Elle passe devant les messages du chat");
  });

  it("n'interprète jamais une phrase comme du HTML", () => {
    const html = renderRow({ phrases: ["<b>gras</b> {user}"] });
    expect(html).toContain("&lt;b&gt;gras&lt;/b&gt; {user}");
    expect(html).not.toContain("<b>gras</b>");
  });
});
