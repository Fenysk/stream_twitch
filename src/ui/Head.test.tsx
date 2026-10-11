import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HeadView, IdlePose, Mouth, PoseFactors } from "../domain/head.types";
import { Head } from "./Head";

const view = (
  mouth: Mouth,
  factors: PoseFactors = { tilt: 1.3, opening: 1.3, scale: 1 },
  idle: IdlePose = { angle: 0, lift: 0 },
): HeadView => ({
  width: 577,
  height: 433,
  cut: { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } },
  ...factors,
  idle,
  mouth,
});

// Le conteneur des deux images : c'est lui qui porte la pose de repos.
const headBoxStyle = (html: string): string =>
  html.match(/<div style="(position:absolute;left[^"]*)"/)?.[1] ?? "";

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

  it("ne transforme pas le conteneur quand la tête est à sa pose neutre", () => {
    const html = renderToStaticMarkup(<Head view={view({ kind: "closed" })} />);
    expect(headBoxStyle(html)).not.toContain("transform");
  });

  it("penche toute la tête autour de son bas-centre pour une pose de repos penchée", () => {
    const left = renderToStaticMarkup(
      <Head view={view({ kind: "closed" }, undefined, { angle: -2, lift: 0 })} />,
    );
    const right = renderToStaticMarkup(
      <Head view={view({ kind: "closed" }, undefined, { angle: 2, lift: 0 })} />,
    );
    expect(headBoxStyle(left)).toContain("transform-origin:50% 100%");
    expect(headBoxStyle(left)).toContain("transform:translateY(0%) rotate(-2deg)");
    expect(headBoxStyle(right)).toContain("transform:translateY(0%) rotate(2deg)");
  });

  it("lève toute la tête d'une fraction de sa hauteur pour la pose de repos levée", () => {
    const html = renderToStaticMarkup(
      <Head view={view({ kind: "closed" }, undefined, { angle: 0, lift: 0.005 })} />,
    );
    expect(headBoxStyle(html)).toContain("transform:translateY(-0.5%) rotate(0deg)");
  });

  it("garde la pose de la bouche sur la moitié haute, séparée de la pose de repos du conteneur", () => {
    const open: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(<Head view={view(open, undefined, { angle: 2, lift: 0 })} />);
    expect(topImageStyle(html)).toContain("rotate(18.2deg)");
    expect(headBoxStyle(html)).toContain("rotate(2deg)");
  });

  it("garde le rapport largeur/hauteur de la scène pour la mettre à l'échelle de la fenêtre", () => {
    const html = renderToStaticMarkup(<Head view={view({ kind: "closed" })} />);
    expect(html).toContain("aspect-ratio:669 / 520");
    expect(html).toContain("width:min(100vw, calc(100vh * 669 / 520))");
  });
});
