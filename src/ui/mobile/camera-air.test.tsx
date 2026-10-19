import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PictureStanding } from "../../domain/picture.schema";
import { BlackScreen } from "./black-screen";
import { CameraBadge, toStatusView } from "./camera-badge";
import { CameraControls } from "./camera-controls";
import { CutCameraButton } from "./cut-camera-button";
import { CutNotice } from "./cut-notice";
import { LiveMicButton } from "./live-mic-button";
import { MobilePage } from "./mobile-page";

const noop = () => undefined;
const asyncNoop = async () => null;

describe("toStatusView", () => {
  it("dit où en est la liaison avec OBS tant que la caméra n'y est pas envoyée, à l'antenne ou non", () => {
    expect(toStatusView("waiting", true)).toEqual({ text: "En attente d'OBS", tone: "plain" });
    expect(toStatusView("connecting", false)).toEqual({ text: "Connexion à OBS…", tone: "plain" });
  });

  it("Quand la caméra est envoyée, le système doit dire « À l'antenne » en rouge ou « Hors antenne » en sourdine", () => {
    expect(toStatusView("connected", true)).toEqual({ text: "À l'antenne", tone: "air" });
    expect(toStatusView("connected", false)).toEqual({ text: "Hors antenne", tone: "quiet" });
  });
});

describe("CameraBadge", () => {
  const badge = (status: "waiting" | "connecting" | "connected", isOnAir: boolean) =>
    renderToStaticMarkup(
      <CameraBadge
        number={1}
        status={status}
        isOnAir={isOnAir}
        onUpdateNumber={asyncNoop}
        onTakePicture={noop}
      />,
    );

  it("montre « À l'antenne » avec un point rouge quand la caméra y est", () => {
    const html = badge("connected", true);
    expect(html).toContain("À l&#x27;antenne");
    expect(html).toContain("control-live-dot");
    expect(html).toContain('data-tone="air"');
    expect(html).not.toContain("Hors antenne");
  });

  it("montre « Hors antenne » en sourdine, sans point rouge, quand la caméra envoyée n'y est pas", () => {
    const html = badge("connected", false);
    expect(html).toContain("Hors antenne");
    expect(html).toContain('data-tone="quiet"');
    expect(html).not.toContain("control-live-dot");
  });

  it("garde le nom de la caméra et la liaison avec OBS tant qu'elle n'est pas établie", () => {
    const html = badge("waiting", true);
    expect(html).toContain("Caméra 1");
    expect(html).toContain("En attente d&#x27;OBS");
    expect(html).not.toContain("control-live-dot");
  });

  it("fait de « Hors antenne » un bouton qui met cette caméra à l'image, et d'elle seule", () => {
    const quiet = badge("connected", false);
    expect(quiet).toMatch(/<button[^>]*title="Mettre cette caméra à l&#x27;image"[^>]*>/);
    expect(quiet).toMatch(/<span class="camera-status" data-tone="quiet"><button/);
    expect(badge("connected", true)).not.toContain("Mettre cette caméra à l&#x27;image");
    expect(badge("connecting", false)).not.toContain("Mettre cette caméra à l&#x27;image");
    expect(badge("waiting", false)).not.toContain("Mettre cette caméra à l&#x27;image");
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
        mic={<LiveMicButton isLiveMic isDisabled={isDisabled} onPress={noop} />}
        onSwitchCamera={noop}
        {...(hasBlackout ? { onBlackout: noop } : {})}
      />,
    );

  it("ajoute le troisième bouton rond (la lune) quand le rôle a l'écran noir", () => {
    expect(controls(true)).toContain("Éteindre l&#x27;écran, la caméra continue");
    expect(controls(true).match(/<button/g)).toHaveLength(3);
  });

  it("n'a que le mic et la caméra sans écran noir, et grise le troisième avec les autres", () => {
    expect(controls(false)).not.toContain("Éteindre");
    expect(controls(false).match(/<button/g)).toHaveLength(2);
    expect(controls(true, true).match(/disabled=""/g)).toHaveLength(3);
  });
});

describe("CutCameraButton : couper ou montrer la caméra", () => {
  const STANDING: PictureStanding = { hasPlace: true, isCurrent: false, shown: "Tête" };
  const button = (standing: PictureStanding, isDisabled = false) =>
    renderToStaticMarkup(<CutCameraButton standing={standing} isDisabled={isDisabled} onPress={noop} />);

  it("est allumé, en bouton ordinaire, quand ce téléphone est à l'image, et dit que le toucher le coupe en gardant le micro", () => {
    const html = button({ hasPlace: true, isCurrent: true, shown: "Caméra 1" });
    expect(html).toContain("Couper la caméra : la tête prend l&#x27;image, le micro reste à ce téléphone");
    expect(html).not.toContain("lp-btn--danger");
    expect(html).not.toContain("disabled");
  });

  it("est barré et rouge quand le téléphone n'est pas à l'image, et dit que le toucher le montre", () => {
    const html = button(STANDING);
    expect(html).toContain("Montrer la caméra de ce téléphone à l&#x27;image");
    expect(html).toContain("lp-btn--danger");
    expect(html).not.toContain("disabled");
  });

  it("est grisé sans place caméra, ou quand la caméra ne tourne pas, mais pas pour quitter l'image", () => {
    expect(button({ hasPlace: false, isCurrent: false, shown: null })).toContain("disabled");
    expect(button(STANDING, true)).toContain("disabled");
    expect(button({ hasPlace: false, isCurrent: true, shown: "Caméra 1" })).not.toContain("disabled");
  });
});

describe("CutNotice : l'avis discret de la caméra coupée", () => {
  const notice = (standing: PictureStanding) => renderToStaticMarkup(<CutNotice standing={standing} />);

  it("dit « Caméra coupée · Tête à l'image » quand la tête est à l'image et que ce téléphone ne l'est pas", () => {
    const html = notice({ hasPlace: true, isCurrent: false, shown: "Tête" });
    expect(html).toContain("Caméra coupée · Tête à l&#x27;image");
    expect(html).toContain('role="status"');
  });

  it("ne dit rien quand le téléphone est à l'image, qu'il n'y a pas de place caméra, ou que personne n'est à l'image", () => {
    expect(notice({ hasPlace: true, isCurrent: true, shown: "Caméra 1" })).toBe("");
    expect(notice({ hasPlace: false, isCurrent: false, shown: null })).toBe("");
    expect(notice({ hasPlace: true, isCurrent: false, shown: null })).toBe("");
  });
});

describe("CameraControls : le bouton qui coupe la caméra", () => {
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
    expect(html.indexOf("Couper la caméra")).toBeGreaterThan(0);
    expect(html.indexOf("Couper la caméra")).toBeLessThan(html.indexOf("Changer de caméra"));
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("n'en met pas quand le rôle ne le donne pas", () => {
    expect(controls(false)).not.toContain("Couper la caméra");
    expect(controls(false).match(/<button/g)).toHaveLength(1);
  });
});

describe("le bouton qui coupe la caméra dans les rôles", () => {
  it("est dans la barre du rôle Caméra et sous l'aperçu du Selfie, grisé tant qu'OBS n'a pas donné de place, sans avis de caméra coupée", () => {
    for (const role of ["camera", "selfie"] as const) {
      const html = renderToStaticMarkup(<MobilePage urlRole={role} onLeaveUrlRole={noop} />);
      expect(html, role).toContain("Montrer la caméra de ce téléphone à l&#x27;image");
      expect(html, role).not.toContain("Caméra coupée");
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
    const html = renderToStaticMarkup(<MobilePage urlRole="selfie" onLeaveUrlRole={noop} />);
    expect(html).toMatch(/class="selfie-preview"[^>]*data-on-air="false"/);
    expect(html).not.toContain("Éteindre l&#x27;écran");
  });
});
