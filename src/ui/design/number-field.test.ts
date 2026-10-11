import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberField } from "./number-field";
import { stepNumber, toNumberText, toText } from "./number-text";

const noop = () => undefined;

const render = (props: { value?: number | null; error?: string; help?: string }): string =>
  renderToStaticMarkup(
    createElement(NumberField, {
      label: "Seuil",
      unit: "dB",
      value: props.value ?? null,
      onInput: noop,
      ...props,
    }),
  );

describe("le texte d'un champ nombre", () => {
  it("lit un nombre, avec la virgule française et les espaces autour", () => {
    expect(toNumberText("-40")).toEqual({ isValid: true, value: -40 });
    expect(toNumberText(" 1,5 ")).toEqual({ isValid: true, value: 1.5 });
    expect(toNumberText("0.005")).toEqual({ isValid: true, value: 0.005 });
  });

  it("lit un champ vidé comme l'absence de valeur", () => {
    expect(toNumberText("")).toEqual({ isValid: true, value: null });
    expect(toNumberText("   ")).toEqual({ isValid: true, value: null });
  });

  it("refuse ce qui n'est pas un nombre fini, sans rien envoyer", () => {
    for (const text of ["abc", "-", "1e", "1.2.3", "Infinity"])
      expect(toNumberText(text)).toEqual({ isValid: false });
  });

  it("écrit la valeur telle qu'elle est, ou rien", () => {
    expect(toText(-12.5)).toBe("-12.5");
    expect(toText(null)).toBe("");
  });

  it("change la valeur d'un pas, sans reste de virgule flottante", () => {
    expect(stepNumber(0.1, 1, 0.1)).toBe(0.2);
    expect(stepNumber(0.2, 1, 0.1)).toBe(0.3);
    expect(stepNumber(-40, -1, 1)).toBe(-41);
    expect(stepNumber(null, 1, 5)).toBe(5);
    expect(stepNumber(0.005, 1, 0.001)).toBe(0.006);
  });
});

describe("le champ nombre", () => {
  it("lie son libellé au champ et écrit l'unité à côté", () => {
    const html = render({ value: -40 });

    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Seuil<\/label>/);
    expect(html).toContain('value="-40"');
    expect(html).toContain(">dB</span>");
  });

  it("montre sa phrase d'aide, et la relie au champ", () => {
    const html = render({ help: "Sous ce niveau, la tête se tait." });

    expect(html).toContain("Sous ce niveau, la tête se tait.");
    expect(html).toMatch(/aria-describedby="[^"]*-help"/);
  });

  it("annonce l'erreur du serveur et marque le champ invalide", () => {
    const html = render({ error: "loudLevel doit dépasser quietLevel" });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/role="alert"[^>]*>loudLevel doit dépasser quietLevel/);
  });

  it("n'a ni erreur ni aide quand il n'y en a pas", () => {
    const html = render({});

    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("role=");
    expect(html).not.toContain("aria-describedby");
  });
});
