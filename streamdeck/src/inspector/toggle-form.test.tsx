import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogueState } from "./catalogue-state";
import { ToggleForm } from "./toggle-form";

const LOADING: CatalogueState = { status: "loading" };

const READY: CatalogueState = {
  status: "ready",
  values: { foxShouldReadChat: true, foxShouldThank: false },
  expressions: [],
};

const render = (settings: Record<string, unknown>, catalogue: CatalogueState = LOADING): string =>
  renderToStaticMarkup(createElement(ToggleForm, { settings, catalogue, onChange: () => undefined }));

describe("le formulaire de l'interrupteur", () => {
  it("offre les six réglages à case, avec leurs libellés de la page des réglages", () => {
    const html = render({});
    for (const label of [
      "Lire le tchat",
      "Lire mes messages",
      "Bilan à la fin prévue",
      "Remercier les follows, subs et cheers",
      "Accueillir les habitués",
      "Afficher les commandes et les bots",
    ]) {
      expect(html).toContain(label);
    }
    expect((html.match(/type="radio"/g) ?? []).length).toBe(6);
  });

  it("coche le réglage de la touche, et aucun tant qu'elle n'en a pas", () => {
    expect((render({}).match(/checked=""/g) ?? []).length).toBe(0);
    const html = render({ setting: "foxShouldThank" });
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toMatch(/value="foxShouldThank"[^>]*checked=""|checked=""[^>]*value="foxShouldThank"/);
  });

  it("écrit l'état du serveur sous chaque réglage quand le plugin l'a lu", () => {
    const html = render({}, READY);
    expect(html).toContain("Activé en ce moment");
    expect(html).toContain("Désactivé en ce moment");
  });

  it("n'écrit aucun état tant que le plugin n'a pas lu le serveur", () => {
    const html = render({ setting: "foxShouldThank" }, LOADING);
    expect(html).not.toContain("en ce moment");
  });

  it("propose le nom sur la touche, avec le libellé du réglage choisi pour exemple", () => {
    const html = render({ setting: "foxShouldReadChat", name: "Tchat" });
    expect(html).toContain("Nom sur la touche");
    expect(html).toContain('value="Tchat"');
    expect(html).toContain('placeholder="Lire le tchat"');
    expect(html).toContain('maxLength="40"');
  });

  it("garde le nom tel qu'il est écrit, espace final compris, pour qu'on puisse écrire le mot suivant", () => {
    expect(render({ setting: "foxShouldReadChat", name: "Mon " })).toContain('value="Mon "');
  });

  it("montre un formulaire vide quand les réglages de la touche sont inattendus", () => {
    const html = render({ setting: "foxVoice", name: 12 });
    expect((html.match(/checked=""/g) ?? []).length).toBe(0);
    expect(html).toContain('value=""');
  });
});
