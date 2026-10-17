import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConfirmedSummary } from "../../domain/clip.schema";
import { ConfirmedRows } from "./confirmed-rows";

const clip = (overrides: Partial<ConfirmedSummary> = {}): ConfirmedSummary => ({
  name: "Replay 2026-10-15 15-09-05.mp4",
  title: "Le saut",
  phrase: "Quel saut !",
  start: 12.5,
  end: 72.5,
  rawName: "Replay 2026-10-15 15-09-05.mp4",
  processedName: "Replay 2026-10-15 15-09-05.mp4",
  confirmedAt: "2026-10-16T10:24:46.845Z",
  version: "1792151962252-15",
  ...overrides,
});

const render = (clips: ConfirmedSummary[], selectedName: string | null = null) =>
  renderToStaticMarkup(
    <ConfirmedRows clips={clips} selectedName={selectedName} onSelect={() => undefined} />,
  );

describe("la liste des clips de l'émission", () => {
  it("montre le titre de chaque clip, sa durée (la partie gardée) et sa date de validation", () => {
    const html = render([clip()]);
    expect(html).toContain("Le saut");
    expect(html).toContain("1:00");
    expect(html).toContain("validé le");
    expect(html).toContain("16 oct. 2026");
  });

  it("garde l'ordre reçu et écrit le titre comme du texte, jamais comme du HTML", () => {
    const html = render([
      clip({ name: "a.mp4", title: "Premier <b>gras</b>" }),
      clip({ name: "b.mp4", title: "Second" }),
    ]);
    expect(html.indexOf("Premier")).toBeLessThan(html.indexOf("Second"));
    expect(html).toContain("Premier &lt;b&gt;gras&lt;/b&gt;");
    expect(html).not.toContain("<b>gras</b>");
  });

  it("marque le clip ouvert dans l'éditeur, et lui seul", () => {
    const html = render([clip({ name: "a.mp4" }), clip({ name: "b.mp4" })], "b.mp4");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(render([clip()])).not.toContain("aria-current");
  });
});
