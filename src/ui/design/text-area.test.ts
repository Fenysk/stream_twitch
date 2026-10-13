import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextArea } from "./text-area";

const noop = () => undefined;

const render = (props: Partial<Parameters<typeof TextArea>[0]> = {}): string =>
  renderToStaticMarkup(
    createElement(TextArea, { label: "Piques", value: "Une\nDeux", onInput: noop, ...props }),
  );

describe("le champ de texte sur plusieurs lignes", () => {
  it("lie son libellé au champ et garde les retours à la ligne de sa valeur", () => {
    const html = render();
    expect(html).toContain("Piques");
    expect(html).toContain("<textarea");
    expect(html).toContain("Une\nDeux");
    expect(html).toMatch(/<label[^>]* for="([^"]+)"[\s\S]*<textarea[^>]* id="\1"/);
  });

  it("prend le style des champs du design system, avec ses lignes", () => {
    const html = render({ rows: 9 });
    expect(html).toContain("lp-input lp-textarea");
    expect(html).toContain('rows="9"');
  });

  it("est désactivable et laisse la correction orthographique de côté (des phrases de renard)", () => {
    const html = render({ isDisabled: true });
    expect(html).toContain("disabled");
    expect(html).toContain('spellCheck="false"');
  });
});
