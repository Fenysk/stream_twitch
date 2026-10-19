import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IDLE_CONTROL } from "../../domain/control.schema";
import type { PictureStanding } from "../../domain/picture.schema";
import { BlackScreen } from "./black-screen";
import { CameraBadge, toStatusView } from "./camera-badge";
import { CameraControls } from "./camera-controls";
import { CutCameraButton } from "./cut-camera-button";
import { CutNotice } from "./cut-notice";
import { MicButton } from "./mic-button";
import { MobilePage } from "./mobile-page";

// L'orientation du téléphone, par test : le rendu du serveur la rend toujours en paysage.
const orientation = vi.hoisted(() => ({ isPortrait: false }));

vi.mock("./use-portrait", () => ({ usePortrait: () => orientation.isPortrait }));

const noop = () => undefined;

describe("toStatusView", () => {
  it("dit où en est la liaison avec OBS tant que la caméra n'y est pas envoyée, à l'antenne ou non", () => {
    expect(toStatusView("waiting", true)).toEqual({ text: "En attente d'OBS", tone: "plain" });
    expect(toStatusView("connecting", false)).toEqual({ text: "Connexion à OBS…", tone: "plain" });
  });

  it("Quand la caméra est envoyée, le système doit dire « À l'antenne » en rouge ou « Prête » en sourdine", () => {
    expect(toStatusView("connected", true)).toEqual({ text: "À l'antenne", tone: "air" });
    expect(toStatusView("connected", false)).toEqual({ text: "Prête", tone: "quiet" });
  });
});

describe("CameraBadge", () => {
  const badge = (status: "waiting" | "connecting" | "connected", isOnAir: boolean) =>
    renderToStaticMarkup(
      <CameraBadge number={1} status={status} isOnAir={isOnAir} isOpen={false} onPress={noop} />,
    );

  it("montre « À l'antenne » avec un point rouge quand la caméra y est", () => {
    const html = badge("connected", true);
    expect(html).toContain("À l&#x27;antenne");
    expect(html).toContain("control-live-dot");
    expect(html).toContain('data-tone="air"');
    expect(html).not.toContain("Prête");
  });

  it("montre « Prête » en sourdine, sans point rouge, quand la caméra envoyée n'est pas à l'antenne", () => {
    const html = badge("connected", false);
    expect(html).toContain("Prête");
    expect(html).toContain('data-tone="quiet"');
    expect(html).not.toContain("control-live-dot");
  });

  it("garde le nom de la caméra et la liaison avec OBS tant qu'elle n'est pas établie", () => {
    const html = badge("waiting", true);
    expect(html).toContain("Caméra 1");
    expect(html).toContain("En attente d&#x27;OBS");
    expect(html).not.toContain("control-live-dot");
  });

  it("ne fait pas de « Prête » un bouton : se montrer passe par « Montrer », un seul endroit pour ce geste", () => {
    const quiet = badge("connected", false);
    expect(quiet).toMatch(/data-tone="quiet"><span class="lp-badge[^"]*">Prête<\/span>/);
    expect(quiet).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Prête/);
    expect(quiet).not.toContain("Mettre cette caméra");
    expect(badge("connecting", false)).not.toContain("Prête");
    expect(badge("waiting", false)).not.toContain("Prête");
  });
});

describe("BlackScreen", () => {
  it("couvre l'écran d'un bouton : un toucher n'importe où le rallume, avec « Touche pour rallumer »", () => {
    const html = renderToStaticMarkup(<BlackScreen isOnAir={false} onWake={noop} />);
    expect(html).toMatch(/^<button[^>]*class="black-screen"/);
    expect(html).toContain("Touche pour rallumer");
    expect(html).toContain('aria-label="Rallumer l&#x27;écran"');
  });

  it("n'ajoute le petit point rouge que si la caméra est à l'antenne, et le dit aux lecteurs d'écran", () => {
    const off = renderToStaticMarkup(<BlackScreen isOnAir={false} onWake={noop} />);
    expect(off).not.toContain("black-screen-air");
    const on = renderToStaticMarkup(<BlackScreen isOnAir onWake={noop} />);
    expect(on).toContain("black-screen-air");
    expect(on).toContain("la caméra est à l&#x27;antenne");
  });
});

describe("CameraControls : l'écran noir", () => {
  const controls = (hasBlackout: boolean, isDisabled = false) =>
    renderToStaticMarkup(
      <CameraControls
        isDisabled={isDisabled}
        mic={<MicButton state={IDLE_CONTROL} ownNumber={null} isExpanded={false} onPress={noop} />}
        onSwitchCamera={noop}
        {...(hasBlackout ? { onBlackout: noop } : {})}
      />,
    );

  it("ajoute le troisième bouton rond (la lune) quand le rôle a l'écran noir", () => {
    expect(controls(true)).toContain("Éteindre l&#x27;écran, la caméra continue");
    expect(controls(true).match(/<button/g)).toHaveLength(3);
  });

  it("n'a que le mic et la caméra sans écran noir, et grise l'objectif et l'écran noir mais pas le micro : il ouvre une feuille", () => {
    expect(controls(false)).not.toContain("Éteindre");
    expect(controls(false).match(/<button/g)).toHaveLength(2);
    expect(controls(true, true).match(/disabled=""/g)).toHaveLength(2);
  });
});

describe("CutCameraButton : cacher ou montrer la caméra", () => {
  const STANDING: PictureStanding = { hasPlace: true, isCurrent: false, shown: "Tête" };
  const button = (standing: PictureStanding, isDisabled = false) =>
    renderToStaticMarkup(<CutCameraButton standing={standing} isDisabled={isDisabled} onPress={noop} />);

  it("dit « Cacher » avec l'œil barré, en bouton neutre, quand ce téléphone a le plan, et que le toucher le rend à la tête en gardant le micro", () => {
    const html = button({ hasPlace: true, isCurrent: true, shown: "Caméra 1" });
    expect(html).toContain(">Cacher<");
    expect(html).toContain("lucide-eye-off");
    expect(html).toContain("Cacher la caméra : la tête reprend le plan, le micro reste à ce téléphone");
    expect(html).not.toContain("lp-btn--danger");
    expect(html).not.toContain("disabled");
  });

  it("dit « Montrer » avec l'œil, en bouton neutre et non rouge, quand le téléphone n'a pas le plan, et que le toucher le montre", () => {
    const html = button(STANDING);
    expect(html).toContain(">Montrer<");
    expect(html).toContain("lucide-eye");
    expect(html).not.toContain("lucide-eye-off");
    expect(html).toContain("Montrer la caméra de ce téléphone au plan");
    expect(html).not.toContain("lp-btn--danger");
    expect(html).not.toContain("disabled");
  });

  it("est grisé sans place caméra, ou quand la caméra ne tourne pas, mais pas pour quitter le plan", () => {
    expect(button({ hasPlace: false, isCurrent: false, shown: null })).toContain("disabled");
    expect(button(STANDING, true)).toContain("disabled");
    expect(button({ hasPlace: false, isCurrent: true, shown: "Caméra 1" })).not.toContain("disabled");
  });
});

describe("CutNotice : l'avis discret de la caméra cachée", () => {
  const notice = (standing: PictureStanding) => renderToStaticMarkup(<CutNotice standing={standing} />);

  it("dit « Caméra cachée · Tête au plan » quand la tête a le plan et que ce téléphone ne l'a pas", () => {
    const html = notice({ hasPlace: true, isCurrent: false, shown: "Tête" });
    expect(html).toContain("Caméra cachée · Tête au plan");
    expect(html).toContain('role="status"');
  });

  it("ne dit rien quand le téléphone est à l'image, qu'il n'y a pas de place caméra, ou que personne n'est à l'image", () => {
    expect(notice({ hasPlace: true, isCurrent: true, shown: "Caméra 1" })).toBe("");
    expect(notice({ hasPlace: false, isCurrent: false, shown: null })).toBe("");
    expect(notice({ hasPlace: true, isCurrent: false, shown: null })).toBe("");
  });
});

describe("CameraControls : le bouton qui cache la caméra", () => {
  const controls = (hasCut: boolean) =>
    renderToStaticMarkup(
      <CameraControls
        isDisabled={false}
        onSwitchCamera={noop}
        {...(hasCut
          ? {
              cut: (
                <CutCameraButton
                  standing={{ hasPlace: true, isCurrent: true, shown: "Caméra 1" }}
                  isDisabled={false}
                  onPress={noop}
                />
              ),
            }
          : {})}
      />,
    );

  it("met le bouton juste avant le changement de caméra, dans la même barre", () => {
    const html = controls(true);
    expect(html.indexOf("Cacher")).toBeGreaterThan(0);
    expect(html.indexOf("Cacher")).toBeLessThan(html.indexOf("Changer de caméra"));
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("n'en met pas quand le rôle ne le donne pas", () => {
    expect(controls(false)).not.toContain("Cacher");
    expect(controls(false).match(/<button/g)).toHaveLength(1);
  });
});

describe("le bouton qui cache la caméra dans les rôles", () => {
  it("est dans la barre du rôle Caméra et sous l'aperçu du Selfie, grisé tant qu'OBS n'a pas donné de place, sans avis de caméra cachée", () => {
    for (const role of ["camera", "selfie"] as const) {
      const html = renderToStaticMarkup(<MobilePage urlRole={role} onLeaveUrlRole={noop} />);
      expect(html, role).toContain("Montrer la caméra de ce téléphone au plan");
      expect(html, role).not.toContain("Caméra cachée");
      const buttonHtml = html.slice(html.indexOf("Montrer la caméra de ce téléphone"));
      expect(buttonHtml.indexOf("disabled"), role).toBeGreaterThanOrEqual(0);
      expect(html.indexOf("Montrer la caméra de ce téléphone"), role).toBeLessThan(
        html.indexOf("Changer de caméra"),
      );
    }
  });
});

describe("le témoin « À l'antenne » dans les rôles", () => {
  it("met sur le rôle Caméra la marque de l'antenne (éteinte au départ) et le bouton de l'écran noir", () => {
    const html = renderToStaticMarkup(<MobilePage urlRole="camera" onLeaveUrlRole={noop} />);
    expect(html).toContain('data-on-air="false"');
    expect(html).toContain("Éteindre l&#x27;écran");
    expect(html).not.toContain("black-screen");
  });

  it("met sur le Selfie la marque de l'antenne sur l'aperçu, sans écran noir", () => {
    orientation.isPortrait = true;
    const html = renderToStaticMarkup(<MobilePage urlRole="selfie" onLeaveUrlRole={noop} />);
    orientation.isPortrait = false;
    expect(html).toMatch(/class="selfie-preview"[^>]*data-on-air="false"/);
    expect(html).not.toContain("Éteindre l&#x27;écran");
  });
});
