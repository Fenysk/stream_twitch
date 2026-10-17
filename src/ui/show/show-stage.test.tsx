import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShowStage } from "./show-stage";
import type { ShowView } from "./show-view";

// Ce que le déroulé montre, par test.
const state = vi.hoisted(() => ({
  view: { kind: "none" } as { kind: string; title?: string; slot?: number; day?: string },
}));

vi.mock("./use-show", () => ({
  useShow: () => ({ videos: [{ current: null }, { current: null }], view: state.view as ShowView }),
}));

beforeEach(() => {
  state.view = { kind: "none" };
});

const render = (): string => renderToStaticMarkup(<ShowStage />);

describe("la page de l'émission", () => {
  it("ne montre rien hors émission : deux vidéos, un bandeau et un titre cachés, sans texte", () => {
    const html = render();
    expect(html.match(/<video/g)).toHaveLength(2);
    expect(html).not.toContain("is-visible");
    expect(html).not.toContain("is-blurred");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-appearance="dark"');
    expect(html).toContain('data-view="none"');
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("montre le bandeau de l'ouverture et de la clôture, avec Jean-Renard grand à droite, sans vidéo", () => {
    for (const [kind, title] of [
      ["opening", "Les bêtises de Fenysk"],
      ["closing", "À la prochaine bêtise"],
    ] as const) {
      state.view = { kind };
      const html = render();
      expect(html).toContain(`data-view="${kind}"`);
      expect(html).toMatch(/show-banner is-visible/);
      expect(html).toContain(title);
      expect(html).toContain("show-fox is-beside");
      expect(html.match(/is-visible/g)).toHaveLength(1);
    }
  });

  it("montre dans le carton le jour du clip en petit et son titre en gros, sur le début du clip flou, Jean-Renard grand à droite", () => {
    state.view = { kind: "card", slot: 1, title: "Le saut <b>fou</b>", day: "2020-10-16" };
    const html = render();
    expect(html).toContain('<p class="show-banner-kicker">16 octobre 2020</p>');
    expect(html).toContain("Le saut &lt;b&gt;fou&lt;/b&gt;");
    expect(html).toMatch(/show-banner is-visible/);
    const videos = html.match(/<video[^>]*>/g) ?? [];
    expect(videos[0]).not.toContain("is-visible");
    expect(videos[1]).toContain("is-visible");
    expect(videos[1]).toContain("is-blurred");
    expect(html).toContain("show-fox is-beside");
    expect(html).not.toMatch(/Clip \d+ sur \d+/);
  });

  it("montre la vidéo nette de l'emplacement qui joue, sans bandeau, avec le titre du clip dans un coin et Jean-Renard petit", () => {
    state.view = { kind: "clip", slot: 0, title: "Le saut" };
    const html = render();
    const videos = html.match(/<video[^>]*>/g) ?? [];
    expect(videos[0]).toContain("is-visible");
    expect(videos[0]).not.toContain("is-blurred");
    expect(videos[1]).not.toContain("is-visible");
    expect(html).not.toMatch(/show-banner is-visible/);
    expect(html).toMatch(/show-title is-visible/);
    expect(html).toContain("lp-pill show-title-pill");
    expect(html).toContain("Le saut");
    expect(html).toContain("show-fox is-corner");
  });
});
