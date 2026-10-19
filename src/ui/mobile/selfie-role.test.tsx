import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlDrawer } from "./control-drawer";
import { SelfieRole } from "./selfie-role";

const noop = () => undefined;

describe("SelfieRole", () => {
  it("montre de haut en bas l'aperçu, le chat avec « Écrire », le bouton « Régie », puis le tiroir fermé", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).toContain("selfie-role");
    const order = ["selfie-preview", "control-banner", "control-chat", "selfie-open", "control-drawer"].map(
      (name) => html.indexOf(name),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Écrire");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Régie<");
    expect(html).toContain('data-open="false"');
  });

  it("met l'aperçu en miroir au départ, la caméra avant étant la caméra du Selfie, et montre le démarrage de la caméra", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).toMatch(/<video[^>]*class="camera-preview is-mirrored"/);
    expect(html).toContain("Démarrage de la caméra…");
    expect(html).not.toContain("camera-role");
  });

  it("met par-dessus l'aperçu la pastille du numéro, la bascule de caméra et le coin qui change de rôle, mais plus le mic du live", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const preview = html.slice(html.indexOf("selfie-preview"), html.indexOf("control-chat"));
    for (const text of ["Caméra…", "Changer de caméra", "Changer de rôle"]) {
      expect(preview).toContain(text);
    }
    expect(preview).not.toContain("Prendre le micro de ce téléphone pour le live");
  });

  it("met le mic du live dans la rangée du bas, à côté de « Régie », à portée du pouce", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const row = html.slice(html.indexOf("selfie-open"), html.indexOf("control-drawer"));
    expect(row).toContain("Prendre le micro de ce téléphone pour le live");
    expect(row).toContain(">Régie<");
    expect(row.indexOf("Prendre le micro")).toBeLessThan(row.indexOf(">Régie<"));
    expect(html.indexOf("control-chat")).toBeLessThan(html.indexOf("selfie-open"));
  });

  it("n'a aucun champ de saisie au départ, met le bandeau sous l'aperçu et garde dans le tiroir les deux pages de la grille", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    expect(html).not.toContain('<input type="text"');
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    for (const text of ["Hors ligne", "OBS non joint", "Micro : –"]) {
      expect(banner).toContain(text);
    }
    const drawer = html.slice(html.indexOf("control-drawer"));
    for (const text of ["Sons", "Jean-Renard", "Fermer la régie"]) {
      expect(drawer).toContain(text);
    }
    expect(html).not.toContain("Scènes");
    expect(html).not.toContain("Micros");
  });

  it("n'a plus le bandeau dans le tiroir de la régie : il ne contient que la grille", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const drawer = html.slice(
      html.indexOf('class="control-drawer"'),
      html.indexOf("Fermer le menu des scènes") - 200,
    );
    expect(drawer).toContain("control-grid");
    expect(drawer).not.toContain("control-banner");
    expect(html.match(/class="control-banner"/g)).toHaveLength(1);
  });

  it("met les menus des scènes et des micros après le tiroir de la régie, pour qu'ils passent dessus, et les garde fermés", () => {
    const html = renderToStaticMarkup(<SelfieRole onUpdateRole={noop} />);
    const drawer = html.indexOf("Fermer la régie");
    const scenes = html.indexOf("Fermer le menu des scènes");
    const mics = html.indexOf("Fermer le menu des micros");
    expect(drawer).toBeGreaterThan(0);
    expect(scenes).toBeGreaterThan(drawer);
    expect(mics).toBeGreaterThan(drawer);
    expect(html).not.toContain('data-open="true"');
    expect(html).toContain("Choisir la scène à l&#x27;antenne");
    expect(html).toContain("Choisir le micro du live");
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
