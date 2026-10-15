import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Scissors, Smile, Tv } from "lucide-react";
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

const renderGrouped = () =>
  renderToStaticMarkup(
    <WindowNav
      groups={[
        { id: "live", label: "En direct", sections: [] },
        {
          id: "sources",
          label: "Sources OBS",
          sections: [
            { id: "head", label: "Tête South Park", icon: Smile },
            { id: "cut", label: "Découpe", icon: Scissors },
          ],
        },
        {
          id: "soon",
          label: "Bientôt",
          sections: [{ id: "twitch", label: "Twitch", icon: Tv, isSoon: true }],
        },
      ]}
      currentId="cut"
      onSelect={() => undefined}
    />,
  );

describe("la barre latérale, des groupes d'onglets", () => {
  it("écrit le titre de chaque groupe au-dessus de ses onglets, dans l'ordre des groupes", () => {
    const html = renderGrouped();
    const titles = [...html.matchAll(/class="lp-window-nav-title[^"]*"[^>]*>([^<]*)</g)].map(
      ([, text]) => text,
    );
    expect(titles).toEqual(["Sources OBS", "Bientôt"]);
    expect(html.indexOf("Sources OBS")).toBeLessThan(html.indexOf("Tête South Park"));
    expect(html.indexOf("Tête South Park")).toBeLessThan(html.indexOf("Découpe"));
    expect(html.indexOf("Découpe")).toBeLessThan(html.indexOf(">Bientôt<"));
    expect(html.indexOf(">Bientôt<")).toBeLessThan(html.indexOf("Twitch"));
  });

  it("ne dessine pas un groupe vide : ni titre ni liste", () => {
    const html = renderGrouped();
    expect(html).not.toContain("En direct");
    expect(html.match(/<li class="lp-window-nav-group"/g)).toHaveLength(2);
    expect(html.match(/<ul aria-labelledby/g)).toHaveLength(2);
  });

  it("nomme chaque groupe par son titre, pour les lecteurs d'écran", () => {
    const html = renderGrouped();
    const groups = [...html.matchAll(/<ul aria-labelledby="([^"]+)"/g)].map(([, id]) => id);
    expect(groups).toHaveLength(2);
    for (const id of groups) expect(html).toContain(`id="${id}"`);
    expect(new Set(groups).size).toBe(2);
  });

  it("reste une seule barre, avec un seul onglet choisi : la sélection glisse d'un groupe à l'autre", () => {
    const html = renderGrouped();
    expect(html.match(/<nav/g)).toHaveLength(1);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>)[\s\S])*Découpe/);
    expect(html.match(/lp-selection/g)).toHaveLength(1);
  });

  it("grise toujours l'onglet annoncé dans son groupe", () => {
    const html = renderGrouped();
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>[\s\S]*Twitch/);
  });

  it("n'écrit aucun titre pour une liste à plat", () => {
    const html = render();
    expect(html).not.toContain("lp-window-nav-title");
    expect(html).not.toContain("aria-labelledby");
  });

  it("garde ses groupes en une seule rangée sur écran étroit, sans leurs titres", () => {
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*\.lp-window-nav \.lp-window-nav-groups \{ gap: var\(--space-2\);/,
    );
    expect(css).toMatch(/@media \(max-width: 640px\) \{[\s\S]*\.lp-window-nav-title \{ display: none;/);
  });
});
