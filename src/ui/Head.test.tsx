import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HeadView, IdlePose, Mouth, PoseFactors } from "../domain/head.types";
import { toImageUrls } from "./expression-urls";
import { Head } from "./Head";

const IMAGES = toImageUrls({ id: "photo", version: "1" });

const view = (
  mouth: Mouth,
  factors: PoseFactors = { tilt: 1.3, opening: 1.3, scale: 1 },
  idle: IdlePose = { angle: 0, lift: 0 },
): HeadView => ({
  width: 577,
  height: 433,
  cut: { left: { x: 240.3, y: 333.2 }, right: { x: 345.1, y: 334.2 } },
  ...factors,
  closing: 0,
  topHeight: 333.7,
  expression: { id: "photo", version: "1" },
  idle,
  mouth,
});

// Le conteneur des deux images : c'est lui qui porte la pose de repos.
const headBoxStyle = (html: string): string =>
  html.match(/<div style="(position:absolute;left[^"]*)"/)?.[1] ?? "";

const topImageStyle = (html: string): string =>
  html.match(/<img[^>]*image\/top\?v=[^"]*"[^>]*style="([^"]*)"/)?.[1] ?? "";

describe("Head", () => {
  it("superpose la moitié haute à la moitié basse, la basse d'abord", () => {
    const html = renderToStaticMarkup(<Head images={IMAGES} view={view({ kind: "closed" })} />);
    expect(html.indexOf("/api/expressions/photo/image/bottom")).toBeGreaterThan(-1);
    expect(html.indexOf("/api/expressions/photo/image/bottom")).toBeLessThan(
      html.indexOf("/api/expressions/photo/image/top"),
    );
  });

  it("ne tourne pas la moitié haute quand la bouche est fermée", () => {
    const html = renderToStaticMarkup(<Head images={IMAGES} view={view({ kind: "closed" })} />);
    expect(topImageStyle(html)).not.toContain("transform");
  });

  it("tourne autour de la charnière droite, l'angle multiplié par l'ouverture", () => {
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "open", pose: { pivot: "right", angle: 14 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:59.809% 77.182%");
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(18.2deg)");
  });

  it("tourne autour de la charnière gauche dans l'autre sens", () => {
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "open", pose: { pivot: "left", angle: -7 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:41.646% 76.952%");
    expect(topImageStyle(html)).toContain("rotate(-9.1deg)");
  });

  it("lève la moitié haute perpendiculairement à la coupe pour une pose centrale", () => {
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } })} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:50.728% 77.067%");
    expect(topImageStyle(html)).toContain("translate(0.025%, -3.461%) rotate(3.9deg)");
  });

  it("tourne selon le tilt et soulève selon l'opening, séparément", () => {
    const center: Mouth = { kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } };
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view(center, { tilt: 1, opening: 1.8, scale: 1 })} />,
    );
    expect(topImageStyle(html)).toContain("transform:translate(0.034%, -4.792%) rotate(3deg)");
  });

  it("garde l'angle d'une pose à pivot quel que soit l'opening", () => {
    const right: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view(right, { tilt: 1, opening: 2.5, scale: 1 })} />,
    );
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(14deg)");
  });

  it("multiplie l'angle et la levée par le scale du message", () => {
    const center: Mouth = { kind: "open", pose: { pivot: "center", angle: 3, lift: 0.11 } };
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view(center, { tilt: 1, opening: 1.8, scale: 1.5 })} />,
    );
    expect(topImageStyle(html)).toContain("transform:translate(0.051%, -7.188%) rotate(4.5deg)");
  });

  it("applique le scale à l'angle d'une pose à pivot", () => {
    const right: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view(right, { tilt: 1, opening: 1.8, scale: 1.5 })} />,
    );
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(21deg)");
  });

  it("ne transforme pas le conteneur quand la tête est à sa pose neutre", () => {
    const html = renderToStaticMarkup(<Head images={IMAGES} view={view({ kind: "closed" })} />);
    expect(headBoxStyle(html)).not.toContain("transform");
  });

  it("penche toute la tête autour de son bas-centre pour une pose de repos penchée", () => {
    const left = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "closed" }, undefined, { angle: -2, lift: 0 })} />,
    );
    const right = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "closed" }, undefined, { angle: 2, lift: 0 })} />,
    );
    expect(headBoxStyle(left)).toContain("transform-origin:50% 100%");
    expect(headBoxStyle(left)).toContain("transform:translateY(0%) rotate(-2deg)");
    expect(headBoxStyle(right)).toContain("transform:translateY(0%) rotate(2deg)");
  });

  it("lève toute la tête d'une fraction de sa hauteur pour la pose de repos levée", () => {
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view({ kind: "closed" }, undefined, { angle: 0, lift: 0.005 })} />,
    );
    expect(headBoxStyle(html)).toContain("transform:translateY(-0.5%) rotate(0deg)");
  });

  it("garde la pose de la bouche sur la moitié haute, séparée de la pose de repos du conteneur", () => {
    const open: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={view(open, undefined, { angle: 2, lift: 0 })} />,
    );
    expect(topImageStyle(html)).toContain("rotate(18.2deg)");
    expect(headBoxStyle(html)).toContain("rotate(2deg)");
  });

  it("montre les images de l'expression donnée, versionnées", () => {
    const html = renderToStaticMarkup(
      <Head images={toImageUrls({ id: "abcd0001", version: "42.7" })} view={view({ kind: "closed" })} />,
    );
    expect(html).toContain('src="/api/expressions/abcd0001/image/bottom?v=42.7"');
    expect(html).toContain('src="/api/expressions/abcd0001/image/top?v=42.7"');
  });

  it("fait descendre la moitié haute de la fermeture, perpendiculairement à la coupe, bouche fermée", () => {
    const html = renderToStaticMarkup(
      <Head images={IMAGES} view={{ ...view({ kind: "closed" }), closing: 14 }} />,
    );
    expect(topImageStyle(html)).toContain("transform-origin:50.728% 77.067%");
    expect(topImageStyle(html)).toContain("rotate(0deg)");
    expect(topImageStyle(html)).toMatch(/translate\(-0\.0\d+%, 3\.\d+%\)/);
  });

  it("fait descendre aussi la moitié haute quand la bouche est ouverte : les poses partent de la position fermée", () => {
    const open: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(<Head images={IMAGES} view={{ ...view(open), closing: 14 }} />);
    // Les 14 px de closing, tournés de 18,2° autour de la charnière avec la moitié haute.
    expect(topImageStyle(html)).toContain("transform:translate(-0.78%, 3.062%) rotate(18.2deg)");
  });

  it("laisse la photo telle qu'elle était : sans closing, une pose ouverte ne décale rien", () => {
    const open: Mouth = { kind: "open", pose: { pivot: "right", angle: 14 } };
    const html = renderToStaticMarkup(<Head images={IMAGES} view={view(open)} />);
    expect(topImageStyle(html)).toContain("transform:translate(0%, 0%) rotate(18.2deg)");
  });

  it("tient dans sa boîte avec la mise en page box, sans se poser sur toute la fenêtre", () => {
    const box = renderToStaticMarkup(<Head images={IMAGES} layout="box" view={view({ kind: "closed" })} />);
    const screen = renderToStaticMarkup(<Head images={IMAGES} view={view({ kind: "closed" })} />);
    expect(screen).toContain("position:fixed");
    expect(box).not.toContain("position:fixed");
    expect(box).toContain("width:100%");
  });

  it("garde le rapport largeur/hauteur de la scène pour la mettre à l'échelle de la fenêtre", () => {
    const html = renderToStaticMarkup(<Head images={IMAGES} view={view({ kind: "closed" })} />);
    expect(html).toContain("aspect-ratio:773 / 498");
    expect(html).toContain("width:min(100vw, calc(100vh * 773 / 498))");
  });
});
