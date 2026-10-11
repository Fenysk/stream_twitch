import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, toPngSize } from "./png.rules";

// Une signature PNG, puis un bloc IHDR : 4 octets de longueur, « IHDR », largeur et hauteur sur 4 octets chacune.
const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

describe("toPngSize", () => {
  it("lit la largeur et la hauteur d'un PNG", () => {
    expect(toPngSize(png(332, 476))).toEqual({ width: 332, height: 476 });
    expect(toPngSize(png(1, 2000))).toEqual({ width: 1, height: 2000 });
  });

  it("refuse ce qui n'est pas un PNG : un JPEG, du texte, un fichier vide", () => {
    expect(toPngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]))).toBeUndefined();
    expect(toPngSize(new TextEncoder().encode("pas une image du tout, juste du texte"))).toBeUndefined();
    expect(toPngSize(new Uint8Array())).toBeUndefined();
  });

  it("refuse un PNG tronqué avant ses dimensions", () => {
    expect(toPngSize(png(10, 10).slice(0, 20))).toBeUndefined();
  });

  it("refuse une image de largeur ou de hauteur nulle", () => {
    expect(toPngSize(png(0, 10))).toBeUndefined();
    expect(toPngSize(png(10, 0))).toBeUndefined();
  });

  it("fixe les limites : 4 Mo et 2000 px de côté", () => {
    expect(MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_IMAGE_SIDE).toBe(2000);
  });
});
