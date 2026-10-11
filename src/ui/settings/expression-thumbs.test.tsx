import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExpressionSummary } from "../../domain/expression.schema";
import { ExpressionThumbs } from "./expression-thumbs";

const EXPRESSIONS: ExpressionSummary[] = [
  { id: "photo", name: "Photo", version: "7", isBuiltIn: true },
  { id: "abcd0001", name: "Méfiant", version: "12.5", isBuiltIn: false },
];

const render = (currentId: string | null) =>
  renderToStaticMarkup(
    <ExpressionThumbs
      label="Expressions"
      expressions={EXPRESSIONS}
      currentId={currentId}
      onPick={() => undefined}
    />,
  );

describe("ExpressionThumbs", () => {
  it("montre une vignette par expression, avec son nom", () => {
    const html = render(null);
    expect(html).toContain("Photo");
    expect(html).toContain("Méfiant");
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("empile les deux moitiés de l'image de chaque expression, versionnées", () => {
    const html = render(null);
    expect(html).toContain('src="/api/expressions/abcd0001/image/bottom?v=12.5"');
    expect(html).toContain('src="/api/expressions/abcd0001/image/top?v=12.5"');
  });

  it("marque la vignette choisie, et elle seule", () => {
    const html = render("abcd0001");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/is-selected[^>]*aria-pressed="true"[\s\S]*Méfiant/);
  });

  it("n'en marque aucune quand aucune n'est choisie", () => {
    expect(render(null)).not.toContain('aria-pressed="true"');
  });
});
