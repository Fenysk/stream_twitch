import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogueState } from "./catalogue-state";
import { PresetForm } from "./preset-form";

const LOADING: CatalogueState = { status: "loading" };

const READY: CatalogueState = {
  status: "ready",
  values: { foxShouldReadChat: true, chatTextSize: 32 },
  expressions: [
    { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
    { id: "fdef51f3", name: "Neutre", version: "2", isBuiltIn: false },
  ],
};

const render = (settings: Record<string, unknown>, catalogue: CatalogueState = LOADING): string =>
  renderToStaticMarkup(createElement(PresetForm, { settings, catalogue, onChange: () => undefined }));

const countOf = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length;

describe("le formulaire du préréglage", () => {
  it("propose le nom du préréglage, avec Préréglage pour exemple", () => {
    const html = render({ name: "Mode jeu" });
    expect(html).toContain("Nom du préréglage");
    expect(html).toContain('value="Mode jeu"');
    expect(html).toContain('placeholder="Préréglage"');
    expect(html).toContain('maxLength="40"');
  });

  it("garde le nom tel qu'il est écrit, espace final compris", () => {
    expect(render({ name: "Mode " })).toContain('value="Mode "');
  });

  it("offre une case par réglage des deux premières actions, avec leurs libellés de la page", () => {
    const html = render({});
    for (const label of [
      "Lire le tchat",
      "Bilan à la fin prévue",
      "Afficher les commandes et les bots",
      "Taille du texte",
      "Durée d&#x27;affichage",
      "Style",
      "Animation d&#x27;apparition",
      "Expression",
    ]) {
      expect(html).toContain(label);
    }
    expect(countOf(html, /<input[^>]*type="checkbox"/g)).toBe(13);
  });

  it("coche les réglages du préréglage, et montre la valeur de chacun sous sa case", () => {
    const html = render({
      pairs: [
        { setting: "foxShouldReadChat", value: false },
        { setting: "chatTextSize", value: 32 },
        { setting: "chatStyle", value: "panel" },
      ],
    });
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(3);
    expect(html).toContain("Désactivé");
    expect(html).toContain('type="range"');
    expect(html).toContain("32 px");
    expect(html).toContain("Panneau");
  });

  it("ne montre aucune valeur pour un réglage qui n'est pas coché", () => {
    const html = render({});
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(0);
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain("Désactivé");
  });

  it("montre les expressions du serveur par leur nom pour le réglage de l'expression", () => {
    const html = render({ pairs: [{ setting: "expression", value: "fdef51f3" }] }, READY);
    expect(html).toContain("Neutre");
    expect(html).toContain("Photo");
  });

  it("ne laisse pas cocher l'expression tant que le serveur n'a pas dit lesquelles existent", () => {
    const html = render({}, { status: "down" });
    expect(countOf(html, /<input[^>]*type="checkbox"[^>]*disabled=""/g)).toBe(1);
  });

  it("écarte les paires que le schéma du réglage refuse", () => {
    const html = render({
      pairs: [
        { setting: "chatTextSize", value: 500 },
        { setting: "foxVoice", value: "x" },
      ],
    });
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(0);
  });
});
