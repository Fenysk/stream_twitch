import { describe, expect, it } from "vitest";
import { AUDIO_MIME, isTitleTaken, toAudioFile, toAudioFormat } from "./sound.rules";
import { SOUND_LIMITS } from "./sound.schema";

const ascii = (text: string): number[] => Array.from(text).map((character) => character.charCodeAt(0));

// Un en-tête de wav (RIFF, taille, WAVE) suivi de silence : assez long pour être un wav.
const wav = (): Uint8Array =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...new Array(40).fill(0)]);
const ogg = (): Uint8Array => Uint8Array.from([...ascii("OggS"), 0, 2, ...new Array(30).fill(0)]);
const mp3WithTag = (): Uint8Array => Uint8Array.from([...ascii("ID3"), 4, 0, ...new Array(30).fill(0)]);
const mp3Untagged = (): Uint8Array => Uint8Array.from([0xff, 0xfb, 0x90, 0x64, ...new Array(30).fill(0)]);

describe("toAudioFormat : le format se lit dans les premiers octets", () => {
  it("reconnaît un wav, un ogg et un mp3 (avec son en-tête ID3, ou directement par une trame)", () => {
    expect(toAudioFormat(wav())).toBe("wav");
    expect(toAudioFormat(ogg())).toBe("ogg");
    expect(toAudioFormat(mp3WithTag())).toBe("mp3");
    expect(toAudioFormat(mp3Untagged())).toBe("mp3");
  });

  it("refuse une image, un RIFF qui n'est pas un wav, de l'AAC et un fichier vide", () => {
    expect(toAudioFormat(Uint8Array.from([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a]))).toBeUndefined();
    expect(
      toAudioFormat(
        Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("AVI "), ...new Array(40).fill(0)]),
      ),
    ).toBeUndefined();
    expect(
      toAudioFormat(Uint8Array.from([0xff, 0xf1, 0x50, 0x80, ...new Array(30).fill(0)])),
    ).toBeUndefined();
    expect(toAudioFormat(new Uint8Array(0))).toBeUndefined();
  });

  it("donne à chaque format son type MIME", () => {
    expect(AUDIO_MIME).toEqual({ mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg" });
  });
});

describe("toAudioFile : un fichier importé tient dans 5 Mo et est un mp3, un wav ou un ogg", () => {
  it("accepte un fichier de 5 Mo pile", () => {
    const bytes = new Uint8Array(SOUND_LIMITS.fileMaxBytes);
    bytes.set(wav());
    expect(toAudioFile(bytes)).toEqual({ ok: true, format: "wav" });
  });

  it("refuse un fichier d'un octet de plus, en disant son poids", () => {
    const bytes = new Uint8Array(SOUND_LIMITS.fileMaxBytes + 1);
    bytes.set(wav());
    expect(toAudioFile(bytes)).toEqual({ ok: false, message: "le fichier pèse 5,0 Mo : 5 Mo au plus" });
    expect(toAudioFile(new Uint8Array(7_340_032))).toEqual({
      ok: false,
      message: "le fichier pèse 7,0 Mo : 5 Mo au plus",
    });
  });

  it("refuse un fichier qui n'est pas de l'audio", () => {
    expect(toAudioFile(Uint8Array.from(ascii("<html></html>")))).toEqual({
      ok: false,
      message: "ce fichier n'est pas un mp3, un wav ou un ogg",
    });
  });
});

describe("isTitleTaken : Twitch refuse deux récompenses de même titre", () => {
  it("compare sans tenir compte des majuscules, des accents de casse ni des blancs de bord", () => {
    expect(isTitleTaken("  Applaudissements ", ["applaudissements"])).toBe(true);
    expect(isTitleTaken("ÉCLAT", ["éclat"])).toBe(true);
  });

  it("laisse passer un titre différent, ou une liste vide", () => {
    expect(isTitleTaken("Rire", ["Rires"])).toBe(false);
    expect(isTitleTaken("Rire", [])).toBe(false);
  });
});
