import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toCheckedValues, ValueChoices } from "./value-choices";

const CHOICES = [
  { value: 16, label: "16 px" },
  { value: 24, label: "24 px" },
  { value: 32, label: "32 px" },
];

describe("ValueChoices", () => {
  it("écrit une case par choix, et coche ceux qui sont choisis", () => {
    const html = renderToStaticMarkup(
      createElement(ValueChoices, {
        label: "Valeurs du cycle",
        choices: CHOICES,
        selected: [24],
        onChange: () => undefined,
      }),
    );
    expect(html).toContain("Valeurs du cycle");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
    expect((html.match(/type="checkbox"[^>]*checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain("16 px");
    expect(html).toContain("24 px");
    expect(html).toContain("32 px");
  });
});

describe("toCheckedValues", () => {
  it("rend les valeurs cochées dans l'ordre des choix, pas dans celui des clics", () => {
    expect(toCheckedValues(CHOICES, [32], 16, true)).toEqual([16, 32]);
    expect(toCheckedValues(CHOICES, [16, 32], 24, true)).toEqual([16, 24, 32]);
  });

  it("retire la valeur décochée", () => {
    expect(toCheckedValues(CHOICES, [16, 24, 32], 24, false)).toEqual([16, 32]);
    expect(toCheckedValues(CHOICES, [24], 24, false)).toEqual([]);
  });

  it("ne change pas les autres valeurs cochées", () => {
    expect(toCheckedValues(CHOICES, [16], 16, true)).toEqual([16]);
  });
});
