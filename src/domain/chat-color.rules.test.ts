import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_SURFACE, isChatColor, toContrast, toReadableColor } from "./chat-color.rules";

const MIN_CONTRAST = 4.5;

describe("isChatColor", () => {
  it("accepte #RRGGBB, quelle que soit la casse, et refuse le reste", () => {
    expect(isChatColor("#1E90ff")).toBe(true);
    expect(isChatColor("#FFF")).toBe(false);
    expect(isChatColor("red")).toBe(false);
    expect(isChatColor("#12345G")).toBe(false);
    expect(isChatColor(null)).toBe(false);
  });
});

describe("toContrast", () => {
  it("vaut 21 entre le noir et le blanc, 1 entre deux couleurs identiques", () => {
    expect(toContrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(toContrast("#336699", "#336699")).toBeCloseTo(1, 5);
  });
});

describe("toReadableColor", () => {
  it("laisse sans couleur un viewer qui n'en a pas : la page prend la couleur par défaut", () => {
    expect(toReadableColor(null)).toBeNull();
  });

  it("laisse intacte une couleur déjà lisible sur le fond", () => {
    expect(toReadableColor("#1E90FF")).toBe("#1E90FF");
    expect(toReadableColor("#FFFFFF")).toBe("#FFFFFF");
  });

  it("éclaircit une couleur illisible jusqu'à un contraste suffisant, en gardant sa teinte", () => {
    const readable = toReadableColor("#0000FF");
    expect(readable).not.toBe("#0000FF");
    expect(toContrast(readable ?? "", CHAT_SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    const red = Number.parseInt((readable ?? "").slice(1, 3), 16);
    const green = Number.parseInt((readable ?? "").slice(3, 5), 16);
    const blue = Number.parseInt((readable ?? "").slice(5, 7), 16);
    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });

  it("éclaircit aussi le noir, en gris", () => {
    const readable = toReadableColor("#000000");
    expect(readable).toMatch(/^#([0-9a-f]{2})\1\1$/i);
    expect(toContrast(readable ?? "", CHAT_SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("rend sans couleur une valeur qui n'est pas #RRGGBB", () => {
    expect(toReadableColor("red")).toBeNull();
  });
});

describe("CHAT_SURFACE", () => {
  it("est la surface des pills en apparence sombre dans tokens.css", () => {
    const tokens = readFileSync("src/ui/design/tokens.css", "utf8");
    const dark = tokens.slice(tokens.indexOf('[data-appearance="dark"]'));
    expect(dark.match(/--pill-surface:\s*(#[0-9a-fA-F]{6})/)?.[1]).toBe(CHAT_SURFACE);
  });
});
