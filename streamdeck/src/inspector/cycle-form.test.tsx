import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogueState } from "./catalogue-state";
import { CycleForm } from "./cycle-form";

const LOADING: CatalogueState = { status: "loading" };

const READY: CatalogueState = {
  status: "ready",
  values: { chatTextSize: 32, chatStyle: "panel", chatDuration: 0, expression: "fdef51f3" },
  expressions: [
    { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
    { id: "fdef51f3", name: "Neutre", version: "2", isBuiltIn: false },
  ],
};

const render = (settings: Record<string, unknown>, catalogue: CatalogueState = LOADING): string =>
  renderToStaticMarkup(createElement(CycleForm, { settings, catalogue, onChange: () => undefined }));

const countOf = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length;

describe("le formulaire du cycle", () => {
  it("offre les sept réglages à valeurs discrètes, avec leurs libellés de la page des réglages", () => {
    const html = render({});
    for (const label of [
      "Taille du texte",
      "Opacité du fond",
      "Durée d&#x27;affichage",
      "Messages à l&#x27;écran",
      "Style",
      "Animation d&#x27;apparition",
      "Expression",
    ]) {
      expect(html).toContain(label);
    }
    expect(countOf(html, /type="radio"/g)).toBe(7);
  });

  it("n'offre aucune valeur tant que la touche n'a pas de réglage", () => {
    const html = render({});
    expect(html).not.toContain("Valeurs du cycle");
    expect(countOf(html, /type="checkbox"/g)).toBe(0);
  });

  it("offre les crans du curseur de la page, avec leur libellé, et coche ceux de la touche", () => {
    const html = render({ setting: "chatTextSize", values: [16, 32] });
    expect(html).toContain("Valeurs du cycle");
    expect(countOf(html, /type="checkbox"/g)).toBe(15);
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(2);
    expect(html).toContain("12 px");
    expect(html).toContain("40 px");
  });

  it("offre les styles par leur libellé", () => {
    const html = render({ setting: "chatStyle", values: ["pill"] });
    expect(html).toContain("Pills");
    expect(html).toContain("Texte seul");
    expect(html).toContain("Panneau");
    expect(countOf(html, /type="checkbox"/g)).toBe(3);
  });

  it("offre les expressions du serveur par leur nom", () => {
    const html = render({ setting: "expression", values: [] }, READY);
    expect(html).toContain("Photo");
    expect(html).toContain("Neutre");
    expect(countOf(html, /type="checkbox"/g)).toBe(2);
  });

  it("garde cochée une expression que la liste ne connaît plus, pour qu'on puisse la décocher", () => {
    const html = render({ setting: "expression", values: ["fdef51f3", "disparue"] }, LOADING);
    expect(html).toContain("disparue");
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(2);
  });

  it("écrit la valeur qui s'applique maintenant sous chaque réglage quand le plugin a lu le serveur", () => {
    const html = render({}, READY);
    expect(html).toContain("32 px en ce moment");
    expect(html).toContain("Panneau en ce moment");
    expect(html).toContain("Toujours en ce moment");
    expect(html).toContain("Neutre en ce moment");
  });

  it("n'écrit aucune valeur tant que le plugin n'a pas lu le serveur", () => {
    expect(render({ setting: "chatTextSize", values: [] }, LOADING)).not.toContain("en ce moment");
  });

  it("écrit l'ordre du cycle à partir de deux valeurs", () => {
    expect(render({ setting: "chatTextSize", values: [24] })).not.toContain("Chaque appui");
    expect(render({ setting: "chatTextSize", values: [32, 16, 24] })).toContain(
      "Chaque appui passe à la valeur suivante : 16 px, 24 px, 32 px, puis 16 px de nouveau.",
    );
  });

  it("propose le nom sur la touche, avec le libellé du réglage choisi pour exemple, espace final compris", () => {
    const html = render({ setting: "chatTextSize", values: [], name: "Mon " });
    expect(html).toContain('value="Mon "');
    expect(html).toContain('placeholder="Taille du texte"');
  });

  it("ne garde que les valeurs que le schéma du réglage permet", () => {
    const html = render({ setting: "chatTextSize", values: [16, 500, "32"] });
    expect(countOf(html, /type="checkbox"[^>]*checked=""/g)).toBe(1);
    expect(html).not.toContain("500");
  });
});
