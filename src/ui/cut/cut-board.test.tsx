import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CutBoard } from "./cut-board";

const SIZE = { width: 400, height: 500 };
const CUT = { left: { x: 100, y: 250 }, right: { x: 300, y: 260 } };

const render = (selected: "left" | "right" = "left") =>
  renderToStaticMarkup(
    <CutBoard
      sourceUrl="/image.png"
      size={SIZE}
      cut={CUT}
      selected={selected}
      onSelect={() => undefined}
      onCutChange={() => undefined}
    />,
  );

describe("CutBoard", () => {
  it("pose une poignée par charnière, en pourcentage de l'image", () => {
    const html = render();
    expect(html).toContain('aria-label="Charnière gauche"');
    expect(html).toContain('aria-label="Charnière droite"');
    expect(html).toContain("left:25%;top:50%");
    expect(html).toContain("left:75%;top:52%");
  });

  it("marque la charnière choisie, et elle seule", () => {
    expect(render("right").match(/cut-handle is-selected/g)).toHaveLength(1);
    expect(render("right")).toMatch(/is-selected"[^>]*aria-label="Charnière droite"/);
  });

  it("trace la coupe sur toute la largeur et teinte la moitié basse", () => {
    const html = render();
    expect(html).toContain('x1="0" y1="245" x2="400" y2="265"');
    expect(html).toContain('class="cut-zone"');
    expect(html).toContain('points="0,245 400,265 400,500 0,500"');
  });

  it("donne une prise pour glisser la ligne, penchée comme elle", () => {
    const html = render();
    expect(html).toContain('aria-label="Ligne de coupe"');
    expect(html).toMatch(/rotate\(0\.049\d+rad\)/);
  });

  it("garde la proportion de l'image", () => {
    expect(render()).toContain("--cut-ratio:0.8");
  });
});
