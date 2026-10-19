import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import { CameraControls } from "./camera-controls";
import { CameraNotice } from "./camera-notice";
import { MicButton } from "./mic-button";
import { MobilePage } from "./mobile-page";
import { RolePicker } from "./role-picker";

// L'orientation du téléphone, par test : le rendu du serveur la rend toujours en paysage.
const orientation = vi.hoisted(() => ({ isPortrait: false }));

vi.mock("./use-portrait", () => ({ usePortrait: () => orientation.isPortrait }));

const noop = () => undefined;

// Le micro du PC et celui de la caméra 1, l'un des deux ouvert.
const withOpen = (open: string): ControlState => ({
  ...IDLE_CONTROL,
  isLinked: true,
  mics: [
    { id: "pc", label: "Micro du PC", isOpen: open === "pc", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isOpen: open === "camera-1", isAvailable: true },
  ],
});

describe("RolePicker", () => {
  it("demande « Ce téléphone sert de… » et propose Caméra, Régie et Selfie avec leur phrase, sans rien présélectionner", () => {
    const html = renderToStaticMarkup(<RolePicker onPick={noop} />);
    expect(html).toMatch(/<h1[^>]*>Ce téléphone sert de…<\/h1>/);
    for (const text of [
      "Caméra",
      "Sur un trépied, sans tchat",
      "Régie",
      "Le tchat et les touches",
      "Selfie",
      "Ta tête, le tchat, la régie",
    ]) {
      expect(html).toContain(text);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).not.toContain("checked");
  });
});

describe("MobilePage", () => {
  it("Quand l'adresse porte ?role=camera, le système doit ouvrir le rôle Caméra sans passer par le choix", () => {
    const html = renderToStaticMarkup(<MobilePage urlRole="camera" onLeaveUrlRole={noop} />);
    expect(html).toContain("camera-role");
    expect(html).not.toContain("Ce téléphone sert de");
  });

  it("Quand l'adresse porte ?role=selfie, le système doit ouvrir le Selfie, ni la caméra ni la régie seule", () => {
    orientation.isPortrait = true;
    const html = renderToStaticMarkup(<MobilePage urlRole="selfie" onLeaveUrlRole={noop} />);
    orientation.isPortrait = false;
    expect(html).toContain("selfie-role");
    expect(html).not.toContain("camera-role");
    expect(html).not.toContain("Ce téléphone sert de");
  });

  it("Quand l'adresse porte ?role=control, le système doit ouvrir la régie, pas le Selfie ni la caméra", () => {
    const html = renderToStaticMarkup(<MobilePage urlRole="control" onLeaveUrlRole={noop} />);
    expect(html).toContain("control-role");
    expect(html).not.toContain("selfie-role");
    expect(html).not.toContain("camera-role");
  });

  it("reste vide à la première peinture sans rôle dans l'adresse : le stockage du téléphone n'est lu qu'ensuite", () => {
    const html = renderToStaticMarkup(<MobilePage urlRole={undefined} onLeaveUrlRole={noop} />);
    expect(html).toContain("mobile-blank");
    expect(html).not.toContain("Ce téléphone sert de");
  });

  it("garde un bouton discret « Changer de rôle » dans chaque rôle", () => {
    for (const role of ["camera", "control", "selfie"] as const) {
      expect(renderToStaticMarkup(<MobilePage urlRole={role} onLeaveUrlRole={noop} />)).toContain(
        "Changer de rôle",
      );
    }
  });

  it("montre sur le rôle Caméra la pastille, la barre du mic et de la caméra, et l'écran de démarrage", () => {
    const html = renderToStaticMarkup(<MobilePage urlRole="camera" onLeaveUrlRole={noop} />);
    expect(html).toContain("Caméra…");
    expect(html).toContain("En attente d&#x27;OBS");
    expect(html).toContain("Micro : –");
    expect(html).toContain("Changer de caméra");
    expect(html).toContain("Démarrage de la caméra…");
    expect(html).toContain("<video");
    expect(html).toContain("playsInline");
  });
});

describe("CameraControls", () => {
  it("dit « Micro : ce tél. » quand ce téléphone est le micro entendu, « Micro : PC » sinon, et ouvre la feuille Micro, sans rouge ni micro barré", () => {
    const on = renderToStaticMarkup(
      <CameraControls
        isDisabled={false}
        mic={<MicButton state={withOpen("camera-1")} ownNumber={1} isExpanded={false} onPress={noop} />}
        onSwitchCamera={noop}
      />,
    );
    expect(on).toContain("Micro : ce tél.");
    expect(on).toContain('title="Choisir le micro"');
    expect(on).not.toContain("lp-btn--danger");
    expect(on).not.toContain("lucide-mic-off");
    const off = renderToStaticMarkup(
      <CameraControls
        isDisabled={false}
        mic={<MicButton state={withOpen("pc")} ownNumber={1} isExpanded onPress={noop} />}
        onSwitchCamera={noop}
      />,
    );
    expect(off).toContain("Micro : PC");
    expect(off).toContain('aria-expanded="true"');
    expect(off).not.toContain("lp-btn--danger");
    expect(off).not.toContain("lucide-mic-off");
  });

  it("grise le changement d'objectif tant que la caméra ne tourne pas, mais pas le micro : il ouvre une feuille", () => {
    const html = renderToStaticMarkup(
      <CameraControls
        isDisabled
        mic={<MicButton state={withOpen("pc")} ownNumber={null} isExpanded={false} onPress={noop} />}
        onSwitchCamera={noop}
      />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

describe("CameraNotice", () => {
  it("Quand la caméra est interrompue, le système doit dire « Touche pour relancer » sur tout l'écran, qui est un bouton", () => {
    const html = renderToStaticMarkup(<CameraNotice status="interrupted" onRestart={noop} />);
    expect(html).toMatch(/^<button[^>]*class="camera-notice"/);
    expect(html).toContain("La caméra s&#x27;est arrêtée");
    expect(html).toContain("Touche pour relancer");
  });

  it("dit comment autoriser la caméra quand elle est refusée, et propose de réessayer", () => {
    const html = renderToStaticMarkup(<CameraNotice status="denied" onRestart={noop} />);
    expect(html).toContain("réglages de Safari");
    expect(html).toContain("Touche pour réessayer");
  });

  it("propose de réessayer quand la caméra est introuvable", () => {
    const html = renderToStaticMarkup(<CameraNotice status="unavailable" onRestart={noop} />);
    expect(html).toContain("Caméra introuvable");
    expect(html).toContain("Touche pour réessayer");
  });

  it("ne demande rien pendant le démarrage : ce n'est pas un bouton", () => {
    const html = renderToStaticMarkup(<CameraNotice status="starting" onRestart={noop} />);
    expect(html).not.toContain("<button");
    expect(html).toContain('role="status"');
  });
});
