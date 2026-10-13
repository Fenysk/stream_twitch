import { describe, expect, it } from "vitest";
import { isWav, MAX_SPEECH_LENGTH, toFrenchVoices, toSpeechText, toWavDuration } from "./voice.rules";
import type { Voice } from "./voice.schema";

describe("toFrenchVoices", () => {
  const voices: Voice[] = [
    { name: "Microsoft Hortense", language: "fr-FR" },
    { name: "Microsoft David", language: "en-US" },
    { name: "Microsoft Claude", language: "fr-CA" },
    { name: "Microsoft Hedda", language: "de-DE" },
    { name: "Microsoft Guillaume", language: "fr-CH" },
    { name: "Microsoft Pierre", language: "FR-be" },
  ];

  it("ne garde que les langues fr-*, dans l'ordre reçu", () => {
    expect(toFrenchVoices(voices).map(({ name }) => name)).toEqual([
      "Microsoft Hortense",
      "Microsoft Claude",
      "Microsoft Guillaume",
      "Microsoft Pierre",
    ]);
  });

  it("rend une liste vide quand aucune voix n'est française", () => {
    expect(toFrenchVoices([{ name: "Microsoft David", language: "en-US" }])).toEqual([]);
  });

  it("ne confond pas une langue qui commence par fr avec le français (« fro-XX »)", () => {
    expect(toFrenchVoices([{ name: "Ancienne", language: "fro-XX" }])).toEqual([]);
  });
});

describe("toSpeechText", () => {
  it("rend le texte sans les espaces du début et de la fin, les blancs répétés ramenés à un seul", () => {
    expect(toSpeechText("  Bonjour   les  amis \n")).toBe("Bonjour les amis");
  });

  it("remplace les retours à la ligne et les caractères de contrôle par une espace", () => {
    expect(toSpeechText("a\r\nb\tc\u0000d\u0007e")).toBe("a b c d e");
  });

  it("refuse un texte vide, ou fait de blancs", () => {
    expect(toSpeechText("")).toBeNull();
    expect(toSpeechText(" \n\t ")).toBeNull();
  });

  it("garde intacts les accents, l'emoji, les guillemets et ce qui ressemble à du code", () => {
    const trap = "Ça va ? \"; $(Get-Date); `whoami` ' é à ü 😉 | & > <";
    expect(toSpeechText(trap)).toBe(trap);
  });

  it("coupe à 500 caractères sans fendre un emoji", () => {
    const long = `${"é".repeat(MAX_SPEECH_LENGTH - 1)}😉😉`;
    const cut = toSpeechText(long);
    expect(Array.from(cut ?? "")).toHaveLength(MAX_SPEECH_LENGTH);
    expect(cut?.endsWith("😉")).toBe(true);
    expect(toSpeechText("é".repeat(MAX_SPEECH_LENGTH + 100))).toBe("é".repeat(MAX_SPEECH_LENGTH));
  });
});

describe("isWav", () => {
  const toCodes = (text: string) => Array.from(text, (character) => character.charCodeAt(0));
  const wav = (size: number) => {
    const bytes = new Uint8Array(size);
    bytes.set(toCodes("RIFF"), 0);
    bytes.set(toCodes("WAVE"), 8);
    return bytes;
  };

  it("reconnaît l'en-tête RIFF/WAVE suivi de son contenu", () => {
    expect(isWav(wav(45))).toBe(true);
    expect(isWav(wav(60_000))).toBe(true);
  });

  it("refuse un fichier vide, un en-tête seul, et autre chose qu'un WAV", () => {
    expect(isWav(new Uint8Array())).toBe(false);
    expect(isWav(wav(44))).toBe(false);
    expect(isWav(new Uint8Array(100))).toBe(false);
    expect(
      isWav(
        Uint8Array.from(toCodes("<html>Une page d'erreur, assez longue pour dépasser l'en-tête.</html>")),
      ),
    ).toBe(false);
  });
});

describe("toWavDuration", () => {
  const toCodes = (text: string) => Array.from(text, (character) => character.charCodeAt(0));
  // Un WAV PCM 16 bits mono, comme celui de WinRT : en-tête de 44 octets puis les échantillons.
  const wav = (options: {
    rate?: number;
    samples: number;
    declaredDataSize?: number;
    hasExtraChunk?: boolean;
  }) => {
    const rate = options.rate ?? 16_000;
    const audioSize = options.samples * 2;
    const extra = options.hasExtraChunk ? 12 : 0;
    const bytes = new Uint8Array(44 + extra + audioSize);
    const view = new DataView(bytes.buffer);
    bytes.set(toCodes("RIFF"), 0);
    view.setUint32(4, 36 + extra + audioSize, true);
    bytes.set(toCodes("WAVE"), 8);
    bytes.set(toCodes("fmt "), 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    let at = 36;
    if (options.hasExtraChunk) {
      bytes.set(toCodes("LIST"), at);
      view.setUint32(at + 4, 4, true);
      at += 12;
    }
    bytes.set(toCodes("data"), at);
    view.setUint32(at + 4, options.declaredDataSize ?? audioSize, true);
    return bytes;
  };

  it("lit la durée dans l'en-tête : 16 000 échantillons à 16 kHz font une seconde", () => {
    expect(toWavDuration(wav({ samples: 16_000 }))).toBe(1000);
    expect(toWavDuration(wav({ samples: 8000 }))).toBe(500);
    expect(toWavDuration(wav({ samples: 24_000, rate: 24_000 }))).toBe(1000);
  });

  it("arrondit à la milliseconde", () => {
    expect(toWavDuration(wav({ samples: 1000 }))).toBe(63);
  });

  it("saute un bloc qui n'est ni fmt ni data", () => {
    expect(toWavDuration(wav({ samples: 16_000, hasExtraChunk: true }))).toBe(1000);
  });

  it("se fie à ce qui est vraiment là quand la taille déclarée est trop grande (flux)", () => {
    expect(toWavDuration(wav({ samples: 16_000, declaredDataSize: 0xffffffff }))).toBe(1000);
  });

  it("ne rend rien pour ce qui n'est pas un WAV", () => {
    expect(toWavDuration(new Uint8Array(100))).toBeUndefined();
    expect(toWavDuration(new Uint8Array())).toBeUndefined();
  });
});
