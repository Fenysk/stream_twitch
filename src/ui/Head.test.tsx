import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HeadView, Mouth, PoseFactors } from "../domain/head.types";
import { Head } from "./Head";

const view = (mouth: Mouth, factors: PoseFactors = { tilt: 1.3, opening: 1.3, scale: 1 }): HeadView => ({
  width: 577,
  height: 433,
  cut: { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } },
  ...factors,
  mouth,
});

const topImageStyle = (html: string): string => html.match(/<img[^>]*top"[^>]*style="([^"]*)"/)?.[1] ?? "";

describe("Head", () => {
  it("superpose la moitié haute à la moitié basse, la basse d'abord", () => {
    const html = renderToStaticMarkup(<Head view={view({ kind: "closed" })} />);
    expect(html.indexOf("/api/head/image/bottom")).toBeGreaterThan(-1);
    expect(html.indexOf("/api/head/image/bottom")).toBeLessThan(html.indexOf("/api/head/image/top"));
  });

  it("ne tourne pas la moitié haute quand la bouche est fermée", () => {
    const html = renderToStaticMarkup(<Head view={view({ kind: "closed" })} />);
    expect(topImageStyle(html)).not.toContain("transform");
  });

  it("tourne autour de la charnière droite, l'angle multiplié par l'ouverture", () => {
    const html = renderToStaticMarkup(
      <Head view={view({ kind: "open", pose: { pivot: "right", angle: 14 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:59.809% 77.182%");
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(18.2deg)");
  });

  it("tourne autour de la charnière gauche dans l'autre sens", () => {
    const html = renderToStaticMarkup(
      <Head view={view({ kind: "open", pose: { pivot: "left", angle: -7 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:41.646% 76.952%");
    expect(topImageStyle(html)).toContain("rotate(-9.1deg)");
  });

  it("lève la moitié haute perpendiculairement à la coupe pour une pose centrale", () => {
    const html = renderToStaticMarkup(
      <Head view={view({ kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:50.728% 77.067%");
    expect(topImageStyle(html)).toContain("translate(0.025%, -3.461%) rotate(3.9deg)");
  });

  it("tourne selon le tilt et soulève selon l'opening, séparément", () => {
    const center: Mouth = { kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } };
    const html = renderToStaticMarkup(<Head view={view(center, { tilt: 1, opening: 1.8, scale: 1 })} />);
    expect(topImageStyle(html)).toContain("transform:translate(0.034%, -4.792%) rotate(3deg)");
  });

  it("garde l'angle d'une pose à pivot quel que soit l'opening", () => {
    const right: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(<Head view={view(right, { tilt: 1, opening: 2.5, scale: 1 })} />);
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(14deg)");
  });

  it("multiplie l'angle et la levée par le scale du message", () => {
    const center: Mouth = { kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } };
    const html = renderToStaticMarkup(<Head view={view(center, { tilt: 1, opening: 1.8, scale: 1.5 })} />);
    expect(topImageStyle(html)).toContain("transform:translate(0.051%, -7.188%) rotate(4.5deg)");
  });

  it("applique le scale à l'angle d'une pose à pivot", () => {
    const right: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(<Head view={view(right, { tilt: 1, opening: 1.8, scale: 1.5 })} />);
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(21deg)");
  });

  it("garde le rapport largeur/hauteur de la scène pour la mettre à l'échelle de la fenêtre", () => {
    const html = renderToStaticMarkup(<Head view={view({ kind: "closed" })} />);
    expect(html).toContain("aspect-ratio:669 / 520");
    expect(html).toContain("width:min(100vw, calc(100vh * 669 / 520))");
  });
});
