import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MobilePage } from "./mobile-page";
import { OtherTab } from "./other-tab";

// Ce que le hook rend, par test : l'onglet a la main ou non.
const tab = vi.hoisted(() => ({ view: { isActive: true, take: () => undefined } }));

vi.mock("./use-active-tab", () => ({ useActiveTab: () => tab.view }));

const noop = () => undefined;

describe("OtherTab", () => {
  it("dit « Ouvert dans un autre onglet » et propose « Reprendre ici », avec le bouton du design system", () => {
    const html = renderToStaticMarkup(<OtherTab onTake={noop} />);
    expect(html).toContain("Ouvert dans un autre onglet");
    expect(html).toMatch(/<button[^>]*class="[^"]*lp-btn[^"]*"[^>]*>/);
    expect(html).toContain("Reprendre ici");
  });

  it("est un écran calme : pas d'aperçu de caméra, pas de pastille de liaison", () => {
    const html = renderToStaticMarkup(<OtherTab onTake={noop} />);
    expect(html).not.toContain("<video");
    expect(html).not.toContain("En attente d&#x27;OBS");
  });
});

describe("MobilePage et l'onglet actif", () => {
  it("Quand l'onglet n'a pas la main, le système doit montrer l'écran calme à la place du rôle, caméra comprise", () => {
    tab.view = { isActive: false, take: noop };
    const html = renderToStaticMarkup(<MobilePage urlRole="camera" onLeaveUrlRole={noop} />);
    expect(html).toContain("Ouvert dans un autre onglet");
    expect(html).toContain("Reprendre ici");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Démarrage de la caméra…");
  });

  it("ne montre l'écran calme à aucun des trois rôles quand l'onglet a la main", () => {
    tab.view = { isActive: true, take: noop };
    for (const role of ["camera", "control", "selfie"] as const) {
      const html = renderToStaticMarkup(<MobilePage urlRole={role} onLeaveUrlRole={noop} />);
      expect(html, role).not.toContain("Ouvert dans un autre onglet");
    }
  });

  it("montre l'écran calme aussi sans rôle : le choix du rôle est un onglet comme un autre", () => {
    tab.view = { isActive: false, take: noop };
    const html = renderToStaticMarkup(<MobilePage urlRole={undefined} onLeaveUrlRole={noop} />);
    expect(html).toContain("Ouvert dans un autre onglet");
  });
});
