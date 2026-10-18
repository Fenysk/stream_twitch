import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import { ShowCountdown } from "./show-countdown";

// L'état que le serveur dit, par test.
const shown = vi.hoisted(() => ({ state: null as ShowState | null }));

vi.mock("../settings/use-show-state", () => ({ useShowState: () => shown.state }));

const running: ShowState = { ...IDLE_SHOW, status: "running", runId: "run1", returnAt: 181_000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  shown.state = IDLE_SHOW;
});

afterEach(() => {
  vi.useRealTimers();
});

const render = (): string => renderToStaticMarkup(<ShowCountdown />);

describe("la page du retour de Fenysk", () => {
  it("Quand l'émission joue et que le serveur estime un retour, le système doit dire dans combien de temps Fenysk revient, dans une pill visible", () => {
    shown.state = running;
    const html = render();
    expect(html).toContain('data-appearance="dark"');
    expect(html).toMatch(/show-countdown-fade is-visible/);
    expect(html).toContain("lp-pill show-countdown-pill");
    expect(html).toContain("Retour de Fenysk dans 4 min");
    expect(html).not.toContain('aria-hidden="true"');
  });

  it("Quand le retour est estimé à une minute ou moins, le système doit dire moins d'une minute", () => {
    shown.state = { ...running, returnAt: 45_000 };
    expect(render()).toContain("Retour de Fenysk dans moins d&#x27;une minute");
  });

  it("Quand l'heure du retour est passée, le système doit dire moins d'une minute, sans compte négatif", () => {
    vi.setSystemTime(200_000);
    shown.state = running;
    expect(render()).toContain("Retour de Fenysk dans moins d&#x27;une minute");
  });

  it("Quand aucune émission ne joue, le système doit rester transparent : pill cachée, sans texte", () => {
    const html = render();
    expect(html).not.toContain("is-visible");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("Retour de Fenysk");
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("Quand l'émission est finie ou arrêtée, le système doit cacher le retour même si un instant reste dans l'état", () => {
    for (const status of ["over", "idle"] as const) {
      shown.state = { ...running, status };
      const html = render();
      expect(html).not.toContain("is-visible");
      expect(html).not.toContain("Retour de Fenysk");
    }
  });

  it("Quand l'émission joue sans retour estimé encore, le système doit cacher le retour", () => {
    shown.state = { ...running, returnAt: 0 };
    const html = render();
    expect(html).not.toContain("is-visible");
    expect(html).not.toContain("Retour de Fenysk");
  });
});
