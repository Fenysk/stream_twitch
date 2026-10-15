import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SECTION_GROUPS } from "./settings-sections";
import { SettingsShell } from "./settings-shell";

const css = readFileSync(join(import.meta.dirname, "settings-shell.css"), "utf8").replace(/\s+/g, " ");

const render = () =>
  renderToStaticMarkup(
    <SettingsShell groups={SECTION_GROUPS} currentId="fox" onSelect={() => undefined}>
      <p>la page</p>
    </SettingsShell>,
  );

describe("la coquille des réglages, le menu", () => {
  it("garde le titre stream_twitch, le choix de l'apparence et la page choisie", () => {
    const html = render();
    expect(html).toContain("stream_twitch");
    expect(html).toContain('aria-label="Apparence"');
    expect(html).toContain("la page");
  });

  it("range Direct en tête sous « En direct », puis les onglets sous « Sources OBS », Twitch sous « Compte », « Bientôt » en bas", () => {
    const html = render();
    expect(html.indexOf(">En direct<")).toBeLessThan(html.indexOf("Direct</button>"));
    expect(html.indexOf("Direct</button>")).toBeLessThan(html.indexOf("Sources OBS"));
    expect(html.indexOf("Sources OBS")).toBeLessThan(html.indexOf("Tête South Park"));
    expect(html.indexOf("Renard")).toBeLessThan(html.indexOf(">Compte<"));
    expect(html.indexOf(">Compte<")).toBeLessThan(html.indexOf("Twitch"));
    expect(html.indexOf("Twitch")).toBeLessThan(html.indexOf(">Bientôt<"));
    expect(html.indexOf(">Bientôt<")).toBeLessThan(html.indexOf("Évènements"));
  });

  it("affiche « En direct », qui a Direct, et « Compte », qui a Twitch : plus aucun groupe vide", () => {
    const html = render();
    expect(html).toContain(">En direct<");
    expect(html).toContain(">Compte<");
  });

  it("laisse Twitch ouvrir sa page : son onglet n'est plus grisé", () => {
    const html = render();
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).not.toMatch(/aria-disabled="true"[^>]*>(?:(?!<\/button>)[\s\S])*Twitch/);
  });

  it("marque l'onglet choisi, et lui seul", () => {
    const html = render();
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>)[\s\S])*Renard/);
  });

  it("laisse le titre de la page à la page : la coquille n'écrit pas de h1", () => {
    expect(render()).not.toContain("<h1");
  });
});

describe("la coquille des réglages, la mise en page", () => {
  it("s'étend jusqu'à 1 600 px, sans plafond de 760 px pour la zone principale", () => {
    expect(css).toMatch(/\.settings-shell \{[^}]*max-width: 1600px;/);
    expect(css).not.toContain("max-width: 760px");
    expect(css).not.toContain("max-width: 1100px");
  });

  it("pose la page sur le fond du design, le menu et les cartes sur la surface des pills", () => {
    expect(css).toMatch(/\.settings-page \{[^}]*background: var\(--void\);/);
    expect(css).toMatch(/\.settings-side[^{]*\{[^}]*background: var\(--pill-surface\);/);
  });

  it("passe le menu en rangée d'onglets au-dessus de la page sur écran étroit", () => {
    expect(css).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*\.settings-shell \{[^}]*flex-direction: column;/,
    );
  });
});
