import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClipSummary } from "../../domain/clip.schema";
import { ClipRows } from "./clip-rows";

const clips: ClipSummary[] = [
  { name: "Replay 2026-10-15 15-21-24.mp4", modifiedAt: Date.UTC(2026, 9, 15, 15, 21), duration: 118.55 },
  { name: "<b>piège</b>.mp4", modifiedAt: Date.UTC(2026, 9, 15, 15, 9), duration: null },
];

const render = (selectedName: string | null) =>
  renderToStaticMarkup(<ClipRows clips={clips} selectedName={selectedName} onSelect={() => undefined} />);

describe("la liste des clips bruts", () => {
  it("montre une ligne par clip dans l'ordre reçu, avec sa durée ou « durée inconnue »", () => {
    const html = render(null);
    expect(html.indexOf("Replay 2026-10-15 15-21-24.mp4")).toBeLessThan(html.indexOf("piège"));
    expect(html).toContain("1:59");
    expect(html).toContain("durée inconnue");
  });

  it("écrit le nom du fichier comme du texte, jamais comme du HTML", () => {
    const html = render(null);
    expect(html).toContain("&lt;b&gt;piège&lt;/b&gt;.mp4");
    expect(html).not.toContain("<b>piège</b>");
  });

  it("marque le clip ouvert dans le lecteur, et lui seul", () => {
    const html = render("Replay 2026-10-15 15-21-24.mp4");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain("is-selected");
    expect(render(null)).not.toContain("aria-current");
  });
});
