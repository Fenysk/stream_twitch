import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { toRoleFilmStart } from "../../domain/phone-layout.rules";
import { ControlDrawer } from "./control-drawer";
import { PhoneScreen } from "./phone-screen";

// Le téléphone est tenu en hauteur : le rendu du serveur le rend toujours en paysage.
vi.mock("./use-portrait", () => ({ usePortrait: () => true }));

const noop = () => undefined;

// Un téléphone qui filme avec l'objectif avant, en portrait : l'état de départ d'un `?role=selfie`.
const SelfieRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => (
  <PhoneScreen initialFilm={toRoleFilmStart("selfie")} onUpdateRole={onUpdateRole} />
);

describe("PhoneScreen qui filme en portrait", () => {
  it("montre de haut en bas l'aperçu, le chat avec « Écrire », le bouton « Sons », puis le tiroir fermé", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).toContain("selfie-role");
    const order = ["selfie-preview", "control-banner", "control-chat", "control-bar", "control-drawer"].map(
      (name) => html.indexOf(name),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Écrire");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Sons<");
    expect(html).toContain('data-open="false"');
  });

  it("met l'aperçu en miroir au départ, la caméra avant étant la caméra du Selfie, et montre le démarrage de la caméra", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).toMatch(/<video[^>]*class="camera-preview is-mirrored"/);
    expect(html).toContain("Démarrage de la caméra…");
    expect(html).not.toContain("camera-role");
  });

  it("met par-dessus l'aperçu la pastille du numéro, la bascule de caméra et le coin qui change de rôle, mais pas le bouton micro du rôle Caméra", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const preview = html.slice(html.indexOf("selfie-preview"), html.indexOf("control-chat"));
    for (const text of ["Caméra…", "Changer de caméra", "Changer de rôle"]) {
      expect(preview).toContain(text);
    }
    expect(preview).not.toContain("Micro : ailleurs");
  });

  it("met « Micro : – » dans la rangée du bas, à côté de « Sons », à portée du pouce", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const row = html.slice(html.indexOf("control-bar"), html.indexOf("control-drawer"));
    expect(row).toContain("Micro : –");
    expect(row).toContain(">Sons<");
    expect(row.indexOf("Micro : –")).toBeLessThan(row.indexOf(">Sons<"));
    expect(html.indexOf("control-chat")).toBeLessThan(html.indexOf("control-bar"));
  });

  it("n'a aucun champ de saisie au départ, met le bandeau sous l'aperçu et garde dans le tiroir la grille des sons seule", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).not.toContain('<input type="text"');
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    for (const text of ["Hors ligne", "<span>–</span>", "Voir l&#x27;antenne en grand"]) {
      expect(banner).toContain(text);
    }
    expect(banner).not.toContain("OBS non joint");
    const drawer = html.slice(html.indexOf("control-drawer"));
    for (const text of ["Sons", "Couper le son", "Fermer les sons"]) {
      expect(drawer).toContain(text);
    }
    expect(drawer).not.toContain("Jean-Renard");
    expect(html).not.toContain("Scènes");
    expect(html).not.toContain("Micros");
  });

  it("n'a plus le bandeau dans le tiroir de la régie : il ne contient que la grille", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const drawer = html.slice(
      html.indexOf('class="control-drawer"'),
      html.indexOf("Fermer l&#x27;antenne") - 200,
    );
    expect(drawer).toContain("control-grid");
    expect(drawer).not.toContain("control-banner");
    expect(html.match(/class="control-banner"/g)).toHaveLength(1);
  });

  it("met les feuilles Antenne, Live et Micro après le tiroir des sons, pour qu'elles passent dessus, et les garde fermées", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const drawer = html.indexOf("Fermer les sons");
    const antenna = html.indexOf("Fermer l&#x27;antenne");
    const mics = html.indexOf("Fermer le menu des micros");
    expect(drawer).toBeGreaterThan(0);
    expect(antenna).toBeGreaterThan(drawer);
    expect(mics).toBeGreaterThan(drawer);
    expect(html).not.toContain('data-open="true"');
    expect(html).toContain("Antenne : choisir la scène et le plan");
    expect(html).toContain("Micro : –");
    expect(html).toContain("Fermer le live");
  });

  it("met l'antenne en vignette en tête du bandeau, sous l'aperçu, sans texte dedans avant le premier état", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner).toContain("monitor-thumbnail");
    expect(banner).toContain("Voir l&#x27;antenne en grand");
    expect(banner).toMatch(/class="monitor-thumbnail"[^>]*>(?:(?!<\/button>)[\s\S])*monitor-empty/);
    expect(banner.indexOf("monitor-thumbnail")).toBeLessThan(banner.indexOf("Hors ligne"));
    for (const text of ["Caméra…", "Changer de rôle", "Commandes de la caméra", "Démarrage de la caméra…"]) {
      expect(html.indexOf(text)).toBeLessThan(html.indexOf("monitor-thumbnail"));
    }
  });

  it("n'a la vignette de l'antenne qu'à un endroit, le bandeau : l'aperçu ne la porte plus", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html.match(/class="monitor-thumbnail"/g)).toHaveLength(1);
    const preview = html.slice(html.indexOf("selfie-preview"), html.indexOf("control-banner"));
    expect(preview).not.toContain("monitor-thumbnail");
  });

  it("garde la feuille de l'antenne fermée au départ, après le tiroir des sons, avec la vignette qui dit qu'elle l'est", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).toMatch(/class="monitor-thumbnail"[^>]*aria-expanded="false"/);
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(html.indexOf("Fermer les sons")).toBeLessThan(html.indexOf("Fermer l&#x27;antenne"));
    expect(html).not.toContain('data-open="true"');
  });

  it("n'a que trois boutons dans la barre du bas, « Micro : X », « Montrer » (la caméra au plan) puis « Sons », et pas « Filmer »", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const bar = html.slice(html.indexOf("control-bar"), html.indexOf("control-drawer"));
    expect(bar.match(/<button/g)).toHaveLength(3);
    expect(bar.indexOf("Micro : –")).toBeLessThan(bar.indexOf("Montrer"));
    expect(bar.indexOf("Montrer")).toBeLessThan(bar.indexOf(">Sons<"));
    expect(bar).not.toContain("Filmer");
  });

  it("a le même haut que la Régie sous l'aperçu : la vignette et sa légende de deux lignes, sans le coin (il est sur l'aperçu)", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner.match(/<button/g)).toHaveLength(3);
    expect(banner.match(/banner-legend/g)).toHaveLength(1);
    expect(banner).not.toContain("role-corner");
    expect(banner).not.toContain("control-menu-pill");
    expect(banner.indexOf("monitor-thumbnail")).toBeLessThan(banner.indexOf("banner-legend"));
    expect(html.indexOf("selfie-preview")).toBeLessThan(html.indexOf("control-banner"));
  });

  it("ouvre la feuille Antenne par la première ligne et la feuille Live par la seconde, comme la Régie", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*<span>–<\/span>/);
    expect(banner).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Hors ligne/);
    expect(banner).toContain("Live : fin prévue, bilan, viewers");
  });
});

describe("ControlDrawer", () => {
  it("dit s'il est ouvert ou fermé, avec la poignée du design system et le voile qui le ferme d'un toucher à côté", () => {
    const closed = renderToStaticMarkup(
      <ControlDrawer isOpen={false} label="Régie" closeLabel="Fermer la régie" onClose={noop}>
        <p>contenu</p>
      </ControlDrawer>,
    );
    expect(closed).toContain('data-open="false"');
    expect(closed).toContain("lp-grabber");
    expect(closed).toContain("control-drawer-scrim");
    expect(closed).toContain("contenu");
    const open = renderToStaticMarkup(
      <ControlDrawer isOpen label="Régie" closeLabel="Fermer la régie" onClose={noop}>
        <p>contenu</p>
      </ControlDrawer>,
    );
    expect(open).toContain('data-open="true"');
  });

  it("nomme la feuille et ce qui la ferme avec les textes qu'on lui donne", () => {
    const html = renderToStaticMarkup(
      <ControlDrawer isOpen label="Scène à l'antenne" closeLabel="Fermer le menu des scènes" onClose={noop}>
        <p>contenu</p>
      </ControlDrawer>,
    );
    expect(html).toContain('aria-label="Scène à l&#x27;antenne"');
    expect(html.match(/aria-label="Fermer le menu des scènes"/g)).toHaveLength(2);
  });
});
