import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_KINDS } from "../../domain/alert.rules";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import { AlertLine, type ShownAlert } from "./alert-line";
import { toAlertActionLabel, toAlertText } from "./alert-text";
import { CameraRole } from "./camera-role";
import { ControlBanner } from "./control-banner";
import { ControlRole } from "./control-role";
import { SelfieRole } from "./selfie-role";
import { getStopAskedAt, updateStopAskedAt } from "./stop-asked";

const noop = () => undefined;
const START = Date.parse("2026-10-19T20:00:00.000Z");

const LIVE: ControlState = {
  ...IDLE_CONTROL,
  isLinked: true,
  scene: "Jeu",
  scenes: ["Jeu"],
  broadcast: { isLive: true, durationMs: 100_000 },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

const alertOf = (overrides: Partial<ShownAlert> = {}): ShownAlert => ({
  kind: "unlinked",
  text: () => "OBS non joint",
  action: null,
  ...overrides,
});

describe("AlertLine : la ligne orange sous le bandeau", () => {
  it("Quand une alerte se montre, le système doit afficher une seule ligne, en orange, avec son texte", () => {
    const html = renderToStaticMarkup(<AlertLine alert={alertOf()} />);
    expect(html.match(/class="(?:[^"]* )?alert-line(?: [^"]*)?"/g)).toHaveLength(1);
    expect(html).toContain("lp-warning");
    expect(html).toContain("OBS non joint");
    expect(html).toContain('role="status"');
  });

  it("n'a pas de bouton quand l'alerte n'en a pas : la reconnexion et le nouvel essai d'OBS sont automatiques", () => {
    const html = renderToStaticMarkup(<AlertLine alert={alertOf()} />);
    expect(html).not.toContain("<button");
  });

  it("montre au plus un bouton, au libellé de l'action", () => {
    const html = renderToStaticMarkup(
      <AlertLine alert={alertOf({ kind: "muted", action: { label: "Rallumer", onPress: noop } })} />,
    );
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Rallumer/);
  });

  it("écrit le texte à l'heure du moment : la durée de « Muet depuis » avance", () => {
    const muted = alertOf({
      kind: "muted",
      text: (now) => toAlertText("muted", { mutedMs: now - START, awayLabel: "" }),
    });
    expect(renderToStaticMarkup(<AlertLine alert={muted} />)).toContain("Muet depuis 0:00");
    vi.setSystemTime(START + 65_000);
    expect(renderToStaticMarkup(<AlertLine alert={muted} />)).toContain("Muet depuis 1:05");
  });
});

describe("toAlertText : les mots de chaque alerte", () => {
  const text = (kind: (typeof ALERT_KINDS)[number], mutedMs = 0, awayLabel = "PC") =>
    toAlertText(kind, { mutedMs, awayLabel });

  it("dit en peu de mots ce qui est faux, un texte par alerte", () => {
    expect(text("lost")).toBe("Connexion perdue · reconnexion…");
    expect(text("stopped")).toBe("Le live s'est arrêté");
    expect(text("unlinked")).toBe("OBS non joint");
    expect(text("muted", 3000)).toBe("Muet depuis 0:03");
    expect(text("camera-stopped")).toBe("Ta caméra s'est arrêtée");
    expect(text("camera-ready")).toBe("Ta caméra est prête");
  });

  it("écrit la durée du muet en m:ss, puis en h:mm:ss au-delà de l'heure", () => {
    expect(text("muted", 125_000)).toBe("Muet depuis 2:05");
    expect(text("muted", 3_725_000)).toBe("Muet depuis 1:02:05");
  });

  it("dit où est le micro : au PC, ou sur la caméra qui l'a", () => {
    expect(text("mic-away", 0, "PC")).toBe("Le micro est au PC");
    expect(text("mic-away", 0, "Caméra 2")).toBe("Le micro est sur Caméra 2");
  });

  it("donne un libellé de bouton à « Live arrêté », « Muet », « Caméra arrêtée », « Caméra prête » et « Micro ailleurs », aucun aux autres", () => {
    expect(ALERT_KINDS.map((kind) => toAlertActionLabel(kind))).toEqual([
      null,
      "OK",
      null,
      "Rallumer",
      "Relancer",
      "Montrer",
      "Prendre",
    ]);
  });
});

describe("ControlBanner périmé", () => {
  const banner = (view: Parameters<typeof ControlBanner>[0]["view"]) =>
    renderToStaticMarkup(<ControlBanner view={view} openMenu={null} onOpenMenu={noop} />);

  it("Quand l'état est périmé, le système doit griser le bandeau avec une classe, et pas autrement", () => {
    const fresh = banner({ state: LIVE, receivedAt: START });
    expect(fresh).not.toContain("control-banner-stale");
    expect(fresh).toMatch(/class="control-banner"/);
    const stale = banner({ state: LIVE, receivedAt: START, staleAt: START });
    expect(stale).toMatch(/class="control-banner control-banner-stale"/);
    expect(banner({ state: LIVE, receivedAt: START, staleAt: null })).not.toContain("control-banner-stale");
  });

  it("cesse de faire avancer la durée du live tant que l'état est périmé : elle reste celle de l'instant où il l'est devenu", () => {
    const stale = { state: LIVE, receivedAt: START - 5000, staleAt: START };
    expect(banner(stale)).toContain("Live 1:45");
    vi.setSystemTime(START + 60_000);
    expect(banner(stale)).toContain("Live 1:45");
    expect(banner({ state: LIVE, receivedAt: START - 5000 })).toContain("Live 2:45");
  });
});

describe("l'arrêt du live demandé depuis cette page", () => {
  it("retient l'instant de l'appui sur « Arrêter », jamais demandé au départ", () => {
    expect(getStopAskedAt()).toBeNull();
    updateStopAskedAt(START);
    expect(getStopAskedAt()).toBe(START);
  });
});

describe("les rôles au départ", () => {
  it("Quand la page vient de s'ouvrir, le système ne doit montrer aucune alerte : il faut qu'une condition dure 3 s", () => {
    for (const page of [
      <ControlRole key="control" onUpdateRole={noop} />,
      <SelfieRole key="selfie" onUpdateRole={noop} />,
      <CameraRole key="camera" onUpdateRole={noop} />,
    ]) {
      expect(renderToStaticMarkup(page)).not.toContain("alert-line");
    }
  });

  it("garde le bandeau de la Régie et du Selfie dans le haut de l'écran, que l'alerte rejoindra sous lui", () => {
    for (const page of [
      <ControlRole key="control" onUpdateRole={noop} />,
      <SelfieRole key="selfie" onUpdateRole={noop} />,
    ]) {
      const html = renderToStaticMarkup(page);
      expect(html).toContain('class="control-top"');
      expect(html.indexOf("control-top")).toBeLessThan(html.indexOf("control-banner"));
    }
  });
});
