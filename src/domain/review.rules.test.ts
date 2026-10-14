import { describe, expect, it } from "vitest";
import { toReviewRules, toReviewText } from "./review.rules";
import type { Settings } from "./settings.schema";

const open = () => false;
const refuse =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name);

describe("toReviewText : le bilan du live", () => {
  it("dit le total, le plus bavard et le premier arrivé", () => {
    const text = toReviewText(
      [
        { nickname: "Alice", messages: 4 },
        { nickname: "Bob", messages: 12 },
        { nickname: "Carole", messages: 3 },
      ],
      open,
    );
    expect(text).toBe(
      "Ce live : 19 messages, de 3 personnes. Le plus bavard : Bob, avec 12 messages. Premier arrivé : Alice.",
    );
  });

  it("à égalité, le plus bavard est le premier arrivé", () => {
    const text = toReviewText(
      [
        { nickname: "Alice", messages: 5 },
        { nickname: "Bob", messages: 5 },
      ],
      open,
    );
    expect(text).toBe(
      "Ce live : 10 messages, de 2 personnes. Le plus bavard : Alice, avec 5 messages. Premier arrivé : Alice.",
    );
  });

  it("met au singulier un seul message, une seule personne", () => {
    expect(toReviewText([{ nickname: "Alice", messages: 1 }], open)).toBe(
      "Ce live : 1 message, de 1 personne. Le plus bavard : Alice, avec 1 message. Premier arrivé : Alice.",
    );
  });

  it("n'a rien à dire quand personne n'a écrit", () => {
    expect(toReviewText([], open)).toBeNull();
  });

  it("saute la partie d'un pseudo refusé, jamais celle des autres", () => {
    const viewers = [
      { nickname: "Vilain", messages: 2 },
      { nickname: "Bob", messages: 12 },
    ];
    expect(toReviewText(viewers, refuse("Vilain"))).toBe(
      "Ce live : 14 messages, de 2 personnes. Le plus bavard : Bob, avec 12 messages.",
    );
    expect(toReviewText(viewers, refuse("Bob"))).toBe(
      "Ce live : 14 messages, de 2 personnes. Premier arrivé : Vilain.",
    );
  });

  it("ne garde que le total quand le plus bavard et le premier arrivé sont refusés", () => {
    expect(toReviewText([{ nickname: "Vilain", messages: 3 }], refuse("Vilain"))).toBe(
      "Ce live : 3 messages, de 1 personne.",
    );
  });

  it("ne dit jamais un pseudo refusé", () => {
    const text = toReviewText(
      [
        { nickname: "Vilain", messages: 30 },
        { nickname: "Alice", messages: 2 },
      ],
      refuse("Vilain"),
    );
    expect(text).not.toContain("Vilain");
  });
});

describe("toReviewRules : le bilan tout seul à la fin prévue", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend la case des réglages", () => {
    expect(toReviewRules({ ...base, foxShouldReviewAtEnd: true })).toEqual({ shouldReviewAtEnd: true });
    expect(toReviewRules({ ...base, foxShouldReviewAtEnd: false })).toEqual({ shouldReviewAtEnd: false });
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toReviewRules(base)).toBeUndefined();
  });
});
