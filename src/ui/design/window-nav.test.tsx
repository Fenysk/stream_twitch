import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Smile, Tv } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WindowNav } from "./window";

const css = readFileSync(join(import.meta.dirname, "window.css"), "utf8").replace(/\s+/g, " ");

const render = () =>
  renderToStaticMarkup(
    <WindowNav
      sections={[
        { id: "head", label: "Tête South Park", icon: Smile },
        { id: "twitch", label: "Twitch", icon: Tv, isSoon: true },
      ]}
      currentId="head"
      onSelect={() => undefined}
    />,
  );

describe("la barre latérale, un onglet qui arrive bientôt", () => {
  it("est grisé et annoncé indisponible : aria-disabled, sans devenir un lien ni un onglet choisi", () => {
    const html = render();
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>[\s\S]*Twitch/);
    expect(html).not.toMatch(/aria-disabled="true"[^>]*aria-current/);
  });

  it("porte l'étiquette « Bientôt », et seulement lui", () => {
    const html = render();
    expect(html.match(/Bientôt/g)).toHaveLength(1);
    expect(html).toMatch(/Twitch[\s\S]*lp-badge[^>]*>[\s\S]*Bientôt/);
  });

  it("laisse l'onglet disponible tel qu'il est : ni aria-disabled ni étiquette", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*aria-current="page"[^>]*>(?:(?!aria-disabled)[\s\S])*Tête South Park/);
  });

  it("se grise avec les jetons du design, sans survol ni appui", () => {
    expect(css).toMatch(
      /\.lp-window-nav \.lp-btn\[aria-disabled="true"\] \{[^}]*opacity: 0\.45;[^}]*cursor: default;/,
    );
    expect(css).toMatch(/\.lp-window-nav \.lp-btn\[aria-disabled="true"\]:hover \{ background: transparent;/);
    expect(css).toMatch(/\.lp-window-nav \.lp-btn\[aria-disabled="true"\]:active \{ transform: none;/);
  });
});
