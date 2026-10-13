import { describe, expect, it } from "vitest";
import type { RawMessage } from "./chat.types";
import type { Settings } from "./settings.schema";
import { SOMEONE, toThanksPlan, toThanksRules } from "./thanks.rules";

const message: RawMessage = {
  id: "m",
  viewerId: "v",
  viewerLogin: "alice",
  nickname: "Alice",
  color: null,
  text: "bravo",
  emotes: [],
  isCommand: false,
};

const open = { isRefused: () => false, viewers: 12 };
const refuse = (...names: string[]) => ({ isRefused: (name: string) => names.includes(name), viewers: 12 });

describe("toThanksPlan : la liste, les valeurs et l'animation de chaque évènement", () => {
  it("un follow : la liste des follows, le pseudo et le nombre de viewers, un sourire", () => {
    expect(toThanksPlan({ kind: "follow", user: "Alice" }, open)).toEqual({
      list: "foxThanksFollow",
      values: { user: "Alice", viewers: 12 },
      show: "smile",
    });
  });

  it("un follow sans nombre de viewers connu (hors ligne, inconnu, zéro) : pas de variable viewers", () => {
    for (const viewers of [null, 0]) {
      expect(toThanksPlan({ kind: "follow", user: "Alice" }, { ...open, viewers }).values).toEqual({
        user: "Alice",
      });
    }
  });

  it("un follow dont le pseudo est refusé : une phrase sans pseudo", () => {
    expect(toThanksPlan({ kind: "follow", user: "c0nn4rd" }, refuse("c0nn4rd"))).toEqual({
      list: "foxThanksFollowGeneric",
      values: {},
      show: "smile",
    });
  });

  it("des follows regroupés : une phrase sans pseudo", () => {
    expect(toThanksPlan({ kind: "follow-group" }, open)).toEqual({
      list: "foxThanksFollowGeneric",
      values: {},
      show: "smile",
    });
  });

  it("un sub ou un resub : la liste des subs, le pseudo, un saut de joie", () => {
    expect(toThanksPlan({ kind: "sub", user: "Alice", message: null }, open)).toEqual({
      list: "foxThanksSub",
      values: { user: "Alice" },
      show: "joy",
    });
    expect(toThanksPlan({ kind: "sub", user: "Alice", message }, open).list).toBe("foxThanksSub");
  });

  it("un sub offert à une personne : le donateur et celui qui reçoit, un saut de joie", () => {
    expect(toThanksPlan({ kind: "gift", user: "Alice", recipient: "Bob" }, open)).toEqual({
      list: "foxThanksGiftOne",
      values: { user: "Alice", recipient: "Bob" },
      show: "joy",
    });
  });

  it("une série de subs offerts : le donateur et le nombre, un saut de joie", () => {
    expect(toThanksPlan({ kind: "mystery-gift", user: "Alice", count: 5 }, open)).toEqual({
      list: "foxThanksGiftMany",
      values: { user: "Alice", count: 5 },
      show: "joy",
    });
  });

  it("des bits : le pseudo et le nombre de bits, un sourire", () => {
    expect(toThanksPlan({ kind: "cheer", user: "Alice", bits: 100, message }, open)).toEqual({
      list: "foxThanksCheer",
      values: { user: "Alice", bits: 100 },
      show: "smile",
    });
  });

  it("un pseudo refusé devient « quelqu'un », hors des follows : le donateur, celui qui reçoit, celui qui envoie les bits", () => {
    expect(SOMEONE).toBe("quelqu'un");
    expect(toThanksPlan({ kind: "sub", user: "Vilain", message: null }, refuse("Vilain")).values).toEqual({
      user: SOMEONE,
    });
    expect(
      toThanksPlan({ kind: "gift", user: "Alice", recipient: "Vilain" }, refuse("Vilain")).values,
    ).toEqual({
      user: "Alice",
      recipient: SOMEONE,
    });
    expect(
      toThanksPlan({ kind: "gift", user: "Vilain", recipient: "Vilain2" }, refuse("Vilain", "Vilain2"))
        .values,
    ).toEqual({
      user: SOMEONE,
      recipient: SOMEONE,
    });
    expect(toThanksPlan({ kind: "mystery-gift", user: "Vilain", count: 5 }, refuse("Vilain")).values).toEqual(
      {
        user: SOMEONE,
        count: 5,
      },
    );
    expect(
      toThanksPlan({ kind: "cheer", user: "Vilain", bits: 50, message }, refuse("Vilain")).values,
    ).toEqual({
      user: SOMEONE,
      bits: 50,
    });
  });
});

describe("toThanksRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend la case, le délai et les six listes de phrases des réglages", () => {
    const rules = toThanksRules({
      ...base,
      foxShouldThank: true,
      foxThankGap: 10_000,
      foxThanksFollow: ["a"],
      foxThanksFollowGeneric: ["b"],
      foxThanksSub: ["c"],
      foxThanksGiftOne: ["d"],
      foxThanksGiftMany: ["e"],
      foxThanksCheer: ["f"],
    });
    expect(rules).toEqual({
      shouldThank: true,
      gap: 10_000,
      phrases: {
        foxThanksFollow: ["a"],
        foxThanksFollowGeneric: ["b"],
        foxThanksSub: ["c"],
        foxThanksGiftOne: ["d"],
        foxThanksGiftMany: ["e"],
        foxThanksCheer: ["f"],
      },
    });
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toThanksRules(base)).toBeUndefined();
  });
});
