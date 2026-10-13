import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FOX_IMAGES, type FoxImage } from "../domain/fox.schema";
import { Fox } from "./Fox";
import { toFoxEventsUrl, toFoxImageUrl } from "./fox-urls";

const render = (image: FoxImage, layout?: "screen" | "box") =>
  renderToStaticMarkup(
    <Fox image={image} bodyRef={createRef<HTMLDivElement>()} {...(layout ? { layout } : {})} />,
  );

const imageTags = (html: string): string[] => html.match(/<img[^>]*>/g) ?? [];

describe("Fox", () => {
  it("empile les 12 images dans la page : changer d'image ne charge rien", () => {
    const tags = imageTags(render("front-closed-rest"));
    expect(tags).toHaveLength(12);
    for (const name of FOX_IMAGES) {
      expect(tags.filter((tag) => tag.includes(`src="${toFoxImageUrl(name)}"`))).toHaveLength(1);
    }
  });

  it("ne montre que l'image choisie, les onze autres sont cachées", () => {
    const tags = imageTags(render("shut-closed-rest"));
    const visible = tags.filter((tag) => tag.includes("visibility:visible"));
    expect(visible).toHaveLength(1);
    expect(visible[0]).toContain("/fox-images/shut-closed-rest.png");
    expect(tags.filter((tag) => tag.includes("visibility:hidden"))).toHaveLength(11);
  });

  it("peint chaque image avec le reste, jamais une image vide entre deux (decoding sync)", () => {
    for (const tag of imageTags(render("left-small-rest"))) expect(tag).toContain('decoding="sync"');
  });

  it("ancre le corps aux pieds : l'échelle part du bas, au centre", () => {
    expect(render("front-closed-rest")).toContain("transform-origin:50% 100%");
  });

  it("garde le rapport de la toile recadrée (648 sur 920)", () => {
    expect(render("front-closed-rest")).toContain("aspect-ratio:648 / 920");
  });

  it("pose le renard en bas de la source OBS, centré, sur toute la fenêtre", () => {
    const html = render("front-closed-rest", "screen");
    expect(html).toContain("position:fixed");
    expect(html).toContain("align-items:flex-end");
    expect(html).toContain("justify-content:center");
    expect(html).toContain("min(100vw, calc(100vh * 648 / 920))");
  });

  it("remplit la boîte de l'aperçu, sans se fixer à la fenêtre", () => {
    const html = render("front-closed-rest", "box");
    expect(html).not.toContain("position:fixed");
    expect(html).toContain("width:100%");
  });

  it("n'ajoute aucun fond : la page OBS reste transparente", () => {
    expect(render("front-closed-rest")).not.toContain("background");
  });
});

describe("les adresses du renard", () => {
  it("servent chaque image depuis public/fox-images, sous son nom", () => {
    expect(toFoxImageUrl("left-closed-rest")).toBe("/fox-images/left-closed-rest.png");
  });

  it("disent au serveur où la page montre le renard : l'écran d'OBS ou l'aperçu", () => {
    expect(toFoxEventsUrl("screen")).toBe("/api/fox/events?place=screen");
    expect(toFoxEventsUrl("preview")).toBe("/api/fox/events?place=preview");
  });
});
