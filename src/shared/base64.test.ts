import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "./base64";

describe("fromBase64", () => {
  it("décode un texte base64 en octets", () => {
    expect(Array.from(fromBase64("iVBORw==") ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("ne donne rien pour un texte qui n'est pas du base64", () => {
    expect(fromBase64("pas du base64 !")).toBeUndefined();
  });

  it("décode un texte vide en zéro octet", () => {
    expect(fromBase64("")?.length).toBe(0);
  });
});

describe("toBase64", () => {
  it("encode des octets en base64, et fromBase64 les retrouve", () => {
    const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    expect(Array.from(fromBase64(toBase64(bytes)) ?? [])).toEqual(Array.from(bytes));
  });

  it("encode un grand tableau sans dépasser la pile", () => {
    const bytes = new Uint8Array(300_000).fill(7);
    expect(fromBase64(toBase64(bytes))?.length).toBe(300_000);
  });
});
