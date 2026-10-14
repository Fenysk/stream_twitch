import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isFillable,
  PHRASE_VARIABLES,
  toCount,
  toFilledPhrase,
  toPhraseLines,
  toPhraseText,
  toVariablesIn,
} from "./phrase.rules";

const defaults: Record<string, unknown> = JSON.parse(readFileSync("settings.json", "utf8"));

describe("les phrases par défaut de settings.json", () => {
  it("existent pour chaque liste de phrases, et chaque liste a au moins une phrase", () => {
    for (const key of Object.keys(PHRASE_VARIABLES)) {
      const phrases = defaults[key];
      expect(Array.isArray(phrases), key).toBe(true);
      expect((phrases as unknown[]).length, key).toBeGreaterThan(0);
    }
  });

  it("n'utilisent que les variables de leur liste, et aucune accolade seule", () => {
    for (const [key, allowed] of Object.entries(PHRASE_VARIABLES)) {
      for (const phrase of defaults[key] as string[]) {
        for (const name of toVariablesIn(phrase)) {
          expect(allowed, `« ${phrase} » (${key}) écrit {${name}}`).toContain(name);
        }
        expect(phrase.replace(/\{\w+\}/g, ""), `« ${phrase} » (${key})`).not.toMatch(/[{}]/);
      }
    }
  });

  it("sont toutes non vides, sans espace en trop aux bords, et sans doublon dans leur liste", () => {
    for (const key of Object.keys(PHRASE_VARIABLES)) {
      const phrases = defaults[key] as string[];
      for (const phrase of phrases) expect(phrase, key).toBe(phrase.trim());
      expect(new Set(phrases).size, key).toBe(phrases.length);
      expect(
        phrases.every((phrase) => phrase !== ""),
        key,
      ).toBe(true);
    }
  });
});

describe("toPhraseLines et toPhraseText : le champ d'une liste", () => {
  it("fait une phrase par ligne, sans espace aux bords ni ligne vide", () => {
    expect(toPhraseLines("  Une phrase  \n\n\r\nUne autre\r\n   \n")).toEqual(["Une phrase", "Une autre"]);
    expect(toPhraseLines("")).toEqual([]);
    expect(toPhraseLines("Seule")).toEqual(["Seule"]);
  });

  it("écrit une phrase par ligne, et relit ce qu'il a écrit", () => {
    const phrases = ["Merci {user} !", "Courage au tchat."];
    expect(toPhraseText(phrases)).toBe("Merci {user} !\nCourage au tchat.");
    expect(toPhraseLines(toPhraseText(phrases))).toEqual(phrases);
    expect(toPhraseText([])).toBe("");
  });
});

describe("toVariablesIn et toFilledPhrase", () => {
  it("liste les variables dans l'ordre, une fois par écriture", () => {
    expect(toVariablesIn("{user} offre un sub à {recipient}. {recipient}, dis merci !")).toEqual([
      "user",
      "recipient",
      "recipient",
    ]);
    expect(toVariablesIn("Aucune variable.")).toEqual([]);
  });

  it("remplace chaque écriture d'une variable, et laisse une variable inconnue telle quelle", () => {
    expect(
      toFilledPhrase("{user} offre à {recipient}. {recipient} !", { user: "Alice", recipient: "Bob" }),
    ).toBe("Alice offre à Bob. Bob !");
    expect(toFilledPhrase("Merci {user} {inconnue}", { user: "Alice" })).toBe("Merci Alice {inconnue}");
    expect(toFilledPhrase("{bits} bits", { bits: 100 })).toBe("100 bits");
  });

  it("ne prend pas un caractère spécial de la valeur pour un motif", () => {
    expect(toFilledPhrase("Merci {user}", { user: "$&$1" })).toBe("Merci $&$1");
  });

  it("dit si toutes les variables ont une valeur", () => {
    expect(isFillable("On est {viewers}.", {})).toBe(false);
    expect(isFillable("On est {viewers}.", { viewers: 12 })).toBe(true);
    expect(isFillable("Aucune variable.", {})).toBe(true);
    expect(isFillable("{user} et {viewers}", { user: "Alice" })).toBe(false);
  });
});

describe("toCount : un compte et son unité", () => {
  it("écrit l'unité au singulier jusqu'à 1, au pluriel au-delà", () => {
    expect(toCount(0, "personne")).toBe("0 personne");
    expect(toCount(1, "personne")).toBe("1 personne");
    expect(toCount(2, "personne")).toBe("2 personnes");
    expect(toCount(12, "message")).toBe("12 messages");
  });
});
