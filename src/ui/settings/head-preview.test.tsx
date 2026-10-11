import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeadPreview } from "./head-preview";

describe("HeadPreview", () => {
  it("pose son cadre sur un damier, nommé pour les lecteurs d'écran", () => {
    const html = renderToStaticMarkup(<HeadPreview />);
    expect(html).toContain("head-preview-stage settings-checker");
    expect(html).toContain('aria-label="Aperçu de la tête"');
  });

  it("n'affiche aucune tête avant le premier état du serveur, plutôt qu'une image cassée", () => {
    expect(renderToStaticMarkup(<HeadPreview />)).not.toContain("<img");
  });
});
