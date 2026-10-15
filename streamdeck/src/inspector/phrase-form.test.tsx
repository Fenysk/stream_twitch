import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhraseForm } from "./phrase-form";

const render = (settings: Record<string, unknown>): string =>
  renderToStaticMarkup(createElement(PhraseForm, { settings, onChange: () => undefined }));

const countOf = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length;

describe("le formulaire de la phrase", () => {
  it("offre le choix entre le texte et le bilan du live, le texte par défaut", () => {
    const html = render({});
    expect(html).toContain("Ce que dit la touche");
    expect(html).toContain("Texte");
    expect(html).toContain("Bilan du live");
    expect(countOf(html, /type="radio"/g)).toBe(2);
    expect(html).toMatch(/value="text"[^>]*checked=""|checked=""[^>]*value="text"/);
  });

  it("montre le champ de la phrase quand la touche dit un texte, avec la limite du serveur", () => {
    const html = render({ kind: "text", text: "Bonjour le tchat" });
    expect(html).toContain("<textarea");
    expect(html).toContain("Bonjour le tchat");
    expect(html).toContain("Ce que Jean-Renard dit");
    expect(html).toContain("500 caractères au plus");
  });

  it("garde le texte tel qu'il est écrit, espaces et retours à la ligne compris", () => {
    expect(render({ text: "Salut \nle tchat " })).toContain("Salut \nle tchat ");
  });

  it("n'écrit pas de champ de phrase pour le bilan, et dit ce qu'il fait", () => {
    const html = render({ kind: "review", text: "gardé" });
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/value="review"[^>]*checked=""|checked=""[^>]*value="review"/);
    expect(html).toContain("le bilan du live au tchat");
    expect(html).toContain("la touche signale une erreur");
  });

  it("propose le nom sur la touche, avec Phrase ou Bilan du live pour exemple, espace final compris", () => {
    expect(render({ kind: "text", name: "Mon " })).toContain('value="Mon "');
    expect(render({ kind: "text" })).toContain('placeholder="Phrase"');
    expect(render({ kind: "review" })).toContain('placeholder="Bilan du live"');
  });

  it("montre le texte quand le genre gardé est inconnu", () => {
    expect(render({ kind: "shout" })).toContain("<textarea");
  });
});
