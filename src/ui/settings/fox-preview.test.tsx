import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FoxPreview } from "./fox-preview";
import { FoxSpeakForm } from "./fox-speak-form";

describe("FoxPreview", () => {
  it("pose son cadre sur un damier, nommé pour les lecteurs d'écran", () => {
    const html = renderToStaticMarkup(<FoxPreview image={null} bodyRef={createRef<HTMLDivElement>()} />);
    expect(html).toContain("head-preview-stage settings-checker fox-preview-stage");
    expect(html).toContain('aria-label="Aperçu du renard"');
  });

  it("n'affiche aucun renard avant que ses images soient chargées, plutôt qu'une image cassée", () => {
    const html = renderToStaticMarkup(<FoxPreview image={null} bodyRef={createRef<HTMLDivElement>()} />);
    expect(html).not.toContain("<img");
  });

  it("montre le renard une fois l'image connue", () => {
    const html = renderToStaticMarkup(
      <FoxPreview image="left-small-rest" bodyRef={createRef<HTMLDivElement>()} />,
    );
    expect(html.match(/<img/g)).toHaveLength(12);
  });
});

describe("FoxSpeakForm", () => {
  it("propose une phrase et « Faire parler », le bouton éteint tant que la phrase est vide", () => {
    const html = renderToStaticMarkup(<FoxSpeakForm isMuted={false} />);
    expect(html).toContain("Phrase");
    expect(html).toContain("Faire parler");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  });

  it("limite la phrase à 500 caractères", () => {
    expect(renderToStaticMarkup(<FoxSpeakForm isMuted={false} />)).toContain('maxLength="500"');
  });

  it("dit pourquoi l'aperçu est muet quand une page /fox est connectée, et sinon se tait", () => {
    expect(renderToStaticMarkup(<FoxSpeakForm isMuted />)).toContain(
      "La page /fox est ouverte (OBS) : le son sort de là, l&#x27;aperçu reste muet.",
    );
    expect(renderToStaticMarkup(<FoxSpeakForm isMuted={false} />)).not.toContain("aperçu reste muet");
  });
});
