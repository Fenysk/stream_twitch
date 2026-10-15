import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsCard, SettingsLoading, SettingsPage } from "./settings-page";

const css = readFileSync(join(import.meta.dirname, "settings-page.css"), "utf8").replace(/\s+/g, " ");

describe("SettingsPage, l'en-tête", () => {
  it("pose le titre de la section en h1, un seul", () => {
    const html = renderToStaticMarkup(<SettingsPage title="Tête South Park">réglages</SettingsPage>);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Tête South Park<\/h1>/);
  });

  it("n'écrit ni emplacement de statut ni emplacement d'actions quand on n'en donne pas", () => {
    const html = renderToStaticMarkup(<SettingsPage title="Découpe">réglages</SettingsPage>);
    expect(html).not.toContain("settings-head-status");
    expect(html).not.toContain("settings-head-actions");
  });

  it("pose le statut puis les actions à droite, dans l'en-tête et avant les réglages", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        title="Renard"
        status={<span>Connecté</span>}
        actions={<button type="button">Remettre</button>}
      >
        réglages
      </SettingsPage>,
    );
    const header = html.match(/<header[\s\S]*<\/header>/)?.[0] ?? "";
    expect(header).toMatch(/<h1[^>]*>Renard<\/h1>/);
    expect(header.indexOf("Connecté")).toBeGreaterThan(header.indexOf("Renard"));
    expect(header.indexOf("Remettre")).toBeGreaterThan(header.indexOf("Connecté"));
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf("réglages"));
  });
});

describe("SettingsPage, les colonnes", () => {
  it("avec un aperçu : l'aperçu à gauche dans un aside nommé, les réglages à droite", () => {
    const html = renderToStaticMarkup(
      <SettingsPage title="Tchat" preview={<p>aperçu</p>}>
        <p>réglages</p>
      </SettingsPage>,
    );
    expect(html).toMatch(/<aside[^>]*aria-label="Aperçu"[^>]*>(?:(?!<\/aside>)[\s\S])*aperçu/);
    expect(html.indexOf("aperçu")).toBeLessThan(html.indexOf("réglages"));
    expect(html).toContain("settings-layout");
    expect(html).not.toMatch(/<aside[^>]*>(?:(?!<\/aside>)[\s\S])*réglages/);
  });

  it("sans aperçu : une seule colonne pleine largeur, sans aside", () => {
    const html = renderToStaticMarkup(
      <SettingsPage title="Découpe">
        <p>réglages</p>
      </SettingsPage>,
    );
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
    expect(html).toContain("réglages");
  });

  it("laisse l'aperçu fixe pendant qu'on défile, sur deux colonnes seulement quand la place le permet", () => {
    expect(css).toMatch(/\.settings-preview \{[^}]*position: sticky;/);
    expect(css).toMatch(/@container \(min-width: 760px\) \{[^}]*\.settings-layout \{[^}]*380px/);
  });
});

describe("SettingsPage, les erreurs", () => {
  it("les écrit en alerte en haut de la colonne des réglages, avant les cartes", () => {
    const html = renderToStaticMarkup(
      <SettingsPage title="Tchat" errors={["Le serveur ne répond pas", "Réponse illisible"]}>
        <SettingsCard title="Allure">curseurs</SettingsCard>
      </SettingsPage>,
    );
    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(html.indexOf("Le serveur ne répond pas")).toBeLessThan(html.indexOf("Réponse illisible"));
    expect(html.indexOf("Réponse illisible")).toBeLessThan(html.indexOf("Allure"));
  });

  it("n'écrit aucune alerte quand il n'y a pas d'erreur", () => {
    const html = renderToStaticMarkup(<SettingsPage title="Tchat">réglages</SettingsPage>);
    expect(html).not.toContain("role=");
    expect(html).not.toContain("settings-errors");
  });

  it("garde les erreurs dans la colonne des réglages, pas sous l'aperçu", () => {
    const html = renderToStaticMarkup(
      <SettingsPage title="Renard" preview={<p>aperçu</p>} errors={["Aucune voix"]}>
        réglages
      </SettingsPage>,
    );
    expect(html.indexOf("aperçu")).toBeLessThan(html.indexOf("Aucune voix"));
    expect(html).not.toMatch(/<aside[^>]*>(?:(?!<\/aside>)[\s\S])*Aucune voix/);
  });
});

describe("SettingsCard", () => {
  it("est un groupe de réglages avec son titre en h2, qui le nomme", () => {
    const html = renderToStaticMarkup(<SettingsCard title="Allure">curseurs</SettingsCard>);
    const id = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeDefined();
    expect(html).toMatch(new RegExp(`<h2[^>]*id="${id}"[^>]*>Allure</h2>`));
    expect(html).toContain("settings-card");
    expect(html.indexOf("Allure")).toBeLessThan(html.indexOf("curseurs"));
  });

  it("sans titre : une surface sans h2", () => {
    const html = renderToStaticMarkup(<SettingsCard>contenu</SettingsCard>);
    expect(html).toContain("settings-card");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("aria-labelledby");
  });

  it("prend la surface des pills, avec leur contour et leur ombre", () => {
    expect(css).toMatch(/\.settings-card \{[^}]*display: grid;/);
    const shell = readFileSync(join(import.meta.dirname, "settings-shell.css"), "utf8").replace(/\s+/g, " ");
    expect(shell).toMatch(
      /\.settings-card[^{]*\{[^}]*background: var\(--pill-surface\);[^}]*var\(--pill-border\)[^}]*var\(--pill-shadow\)/,
    );
  });
});

describe("SettingsLoading", () => {
  it("garde le titre de la page pendant que les réglages se chargent", () => {
    const html = renderToStaticMarkup(<SettingsLoading title="Renard" />);
    expect(html).toMatch(/<h1[^>]*>Renard<\/h1>/);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("<aside");
  });
});
