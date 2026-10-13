import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOX_CANVAS, FOX_IMAGES } from "../domain/fox.schema";

const FOLDER = join("public", "fox-images");

// L'en-tête d'un PNG : signature (8 octets), puis le bloc IHDR : largeur et hauteur sur 4 octets, profondeur, type de couleur.
const toHeader = (name: string) => {
  const bytes = readFileSync(join(FOLDER, `${name}.png`));
  return {
    signature: Array.from(bytes.subarray(0, 4)),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
};

describe("les 12 images du renard (public/fox-images/)", () => {
  it("sont exactement celles du lexique des images, sans image en trop", () => {
    const files = readdirSync(FOLDER)
      .filter((name) => name.endsWith(".png"))
      .map((name) => name.replace(/\.png$/, ""))
      .sort();
    expect(files).toEqual([...FOX_IMAGES].sort());
  });

  it("sont des PNG transparents (RGBA)", () => {
    for (const name of FOX_IMAGES) {
      const { signature, colorType } = toHeader(name);
      expect(signature, name).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(colorType, name).toBe(6);
    }
  });

  it("ont toutes la même toile, recadrée à 648 × 920 : le corps ne bouge pas d'une image à l'autre", () => {
    for (const name of FOX_IMAGES) {
      const { width, height } = toHeader(name);
      expect({ name, width, height }).toEqual({ name, width: FOX_CANVAS.width, height: FOX_CANVAS.height });
    }
  });
});
