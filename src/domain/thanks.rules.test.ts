import { describe, expect, it } from "vitest";
import type { RawMessage } from "./chat.types";
import type { Settings } from "./settings.schema";
import { isLurk, SOMEONE, toRewardKind, toThanksPlan, toThanksRules } from "./thanks.rules";

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

describe("isLurk : le premier mot du message est « !lurk »", () => {
  it("reconnaît !lurk seul, ou suivi d'un texte, sans tenir compte des majuscules", () => {
    expect(isLurk("!lurk")).toBe(true);
    expect(isLurk("!LURK")).toBe(true);
    expect(isLurk("!Lurk")).toBe(true);
    expect(isLurk("!lurk bonne soirée à tous")).toBe(true);
    expect(isLurk("  !lurk")).toBe(true);
    expect(isLurk("!lurk\tbonne soirée")).toBe(true);
  });

  it("ne reconnaît pas un autre premier mot, ni un !lurk qui n'est pas le premier mot", () => {
    expect(isLurk("bonne soirée !lurk")).toBe(false);
    expect(isLurk("!lurker")).toBe(false);
    expect(isLurk("!lurk,")).toBe(false);
    expect(isLurk("lurk")).toBe(false);
    expect(isLurk("!discord")).toBe(false);
    expect(isLurk("")).toBe(false);
    expect(isLurk("   ")).toBe(false);
  });
});

describe("toThanksPlan : la liste, les valeurs et l'animation de chaque évènement", () => {
  it("un lurk : la liste des lurks, le pseudo, un sourire", () => {
    expect(toThanksPlan({ kind: "lurk", user: "Alice" }, open)).toEqual({
      list: "foxThanksLurk",
      values: { user: "Alice" },
      show: "smile",
    });
  });

  it("un lurk dont le pseudo est refusé : une phrase sans pseudo", () => {
    expect(toThanksPlan({ kind: "lurk", user: "c0nn4rd" }, refuse("c0nn4rd"))).toEqual({
      list: "foxThanksLurkGeneric",
      values: {},
      show: "smile",
    });
  });

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

  it("reprend la case, le délai, le nombre de messages d'un viewer très impliqué, les titres des deux récompenses et les quinze listes de phrases des réglages", () => {
    const rules = toThanksRules({
      ...base,
      foxShouldThank: true,
      foxThankGap: 10_000,
      foxTalkativeMessages: 50,
      foxThanksFollow: ["a"],
      foxThanksFollowGeneric: ["b"],
      foxThanksSub: ["c"],
      foxThanksGiftOne: ["d"],
      foxThanksGiftMany: ["e"],
      foxThanksCheer: ["f"],
      foxThanksLurk: ["g"],
      foxThanksLurkGeneric: ["h"],
      foxThanksTalkative: ["i"],
      foxThanksRaid: ["j"],
      foxThanksRaidGeneric: ["k"],
      foxClashRewards: ["Clasher Fenysk"],
      foxWakeRewards: ["Réveiller Jean-Renard"],
      foxThanksWakeAsleep: ["l"],
      foxThanksWakeAwake: ["m"],
      foxThanksPrediction: ["n"],
      foxThanksPredictionNoLoser: ["o"],
    });
    expect(rules).toEqual({
      shouldThank: true,
      gap: 10_000,
      talkativeAt: 50,
      rewards: { clash: ["Clasher Fenysk"], wake: ["Réveiller Jean-Renard"] },
      phrases: {
        foxThanksFollow: ["a"],
        foxThanksFollowGeneric: ["b"],
        foxThanksSub: ["c"],
        foxThanksGiftOne: ["d"],
        foxThanksGiftMany: ["e"],
        foxThanksCheer: ["f"],
        foxThanksLurk: ["g"],
        foxThanksLurkGeneric: ["h"],
        foxThanksTalkative: ["i"],
        foxThanksRaid: ["j"],
        foxThanksRaidGeneric: ["k"],
        foxThanksWakeAsleep: ["l"],
        foxThanksWakeAwake: ["m"],
        foxThanksPrediction: ["n"],
        foxThanksPredictionNoLoser: ["o"],
      },
    });
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toThanksRules(base)).toBeUndefined();
  });
});

describe("toThanksPlan : un viewer très impliqué", () => {
  it("la liste des viewers impliqués, le pseudo et le nombre de messages, un sourire", () => {
    expect(toThanksPlan({ kind: "talkative", user: "Alice", messages: 50 }, open)).toEqual({
      list: "foxThanksTalkative",
      values: { user: "Alice", messages: 50 },
      show: "smile",
    });
  });

  it("un pseudo refusé devient « quelqu'un » : la phrase reste dite, le pseudo non", () => {
    expect(toThanksPlan({ kind: "talkative", user: "Vilain", messages: 50 }, refuse("Vilain"))).toEqual({
      list: "foxThanksTalkative",
      values: { user: SOMEONE, messages: 50 },
      show: "smile",
    });
  });
});

describe("toThanksPlan : un raid", () => {
  it("la liste des raids, le pseudo et le nombre de viewers écrit en toutes lettres, un long coucou", () => {
    expect(toThanksPlan({ kind: "raid", user: "Alice", viewers: 12 }, open)).toEqual({
      list: "foxThanksRaid",
      values: { user: "Alice", viewers: "12 personnes" },
      show: "raid",
    });
  });

  it("écrit « 1 personne » au singulier", () => {
    expect(toThanksPlan({ kind: "raid", user: "Alice", viewers: 1 }, open).values).toEqual({
      user: "Alice",
      viewers: "1 personne",
    });
  });

  it("ne prend pas le nombre de viewers du live : celui du raid est celui de l'évènement", () => {
    expect(
      toThanksPlan({ kind: "raid", user: "Alice", viewers: 3 }, { ...open, viewers: 99 }).values,
    ).toEqual({
      user: "Alice",
      viewers: "3 personnes",
    });
  });

  it("un pseudo refusé : une phrase sans pseudo, avec le nombre de viewers", () => {
    expect(toThanksPlan({ kind: "raid", user: "c0nn4rd", viewers: 12 }, refuse("c0nn4rd"))).toEqual({
      list: "foxThanksRaidGeneric",
      values: { viewers: "12 personnes" },
      show: "raid",
    });
  });
});

describe("toThanksPlan : réveiller le renard", () => {
  it("s'il dormait : la liste du réveil, le pseudo, rien de montré avant la phrase", () => {
    expect(toThanksPlan({ kind: "wake", user: "Alice", isAsleep: true }, open)).toEqual({
      list: "foxThanksWakeAsleep",
      values: { user: "Alice" },
      show: "none",
    });
  });

  it("s'il ne dormait pas : l'autre liste, le pseudo, rien de montré", () => {
    expect(toThanksPlan({ kind: "wake", user: "Alice", isAsleep: false }, open)).toEqual({
      list: "foxThanksWakeAwake",
      values: { user: "Alice" },
      show: "none",
    });
  });

  it("un pseudo refusé devient « quelqu'un » dans les deux listes", () => {
    for (const isAsleep of [true, false]) {
      expect(toThanksPlan({ kind: "wake", user: "Vilain", isAsleep }, refuse("Vilain")).values).toEqual({
        user: SOMEONE,
      });
    }
  });
});

describe("toRewardKind : le titre d'une récompense", () => {
  const titles = { clash: ["Clasher Fenysk"], wake: ["Réveiller Jean-Renard", "Debout !"] };

  it("reconnaît le clash et le réveil par leur titre", () => {
    expect(toRewardKind("Clasher Fenysk", titles)).toBe("clash");
    expect(toRewardKind("Réveiller Jean-Renard", titles)).toBe("wake");
    expect(toRewardKind("Debout !", titles)).toBe("wake");
  });

  it("ne tient compte ni des majuscules ni des espaces aux bords", () => {
    expect(toRewardKind("  clasher fenysk ", titles)).toBe("clash");
    expect(toRewardKind("RÉVEILLER JEAN-RENARD", titles)).toBe("wake");
    expect(toRewardKind("Clasher Fenysk", { clash: ["  CLASHER FENYSK"], wake: [] })).toBe("clash");
  });

  it("ignore tout autre titre, y compris un titre qui contient seulement le bon", () => {
    expect(toRewardKind("Hydrate-toi", titles)).toBeNull();
    expect(toRewardKind("Clasher Fenysk deux fois", titles)).toBeNull();
    expect(toRewardKind("Clasher", titles)).toBeNull();
    expect(toRewardKind("", titles)).toBeNull();
  });

  it("n'ignore rien d'autre que ce qui manque : une liste vide ne reconnaît rien", () => {
    expect(toRewardKind("Clasher Fenysk", { clash: [], wake: [] })).toBeNull();
    expect(toRewardKind("Clasher Fenysk", { clash: [], wake: ["Clasher Fenysk"] })).toBe("wake");
  });

  it("donne le clash quand le même titre est dans les deux listes", () => {
    expect(toRewardKind("Les deux", { clash: ["Les deux"], wake: ["Les deux"] })).toBe("clash");
  });
});

describe("toThanksPlan : une prédiction terminée", () => {
  it("avec des perdants : leur nombre en toutes lettres et l'issue, rien de montré avant la phrase", () => {
    expect(toThanksPlan({ kind: "prediction", losers: 12, outcome: "Oui" }, open)).toEqual({
      list: "foxThanksPrediction",
      values: { perdants: "12 personnes", issue: "Oui" },
      show: "none",
    });
  });

  it("un seul perdant : « 1 personne »", () => {
    expect(toThanksPlan({ kind: "prediction", losers: 1, outcome: "Non" }, open).values).toEqual({
      perdants: "1 personne",
      issue: "Non",
    });
  });

  it("sans perdant : l'autre liste, sans variable", () => {
    expect(toThanksPlan({ kind: "prediction", losers: 0, outcome: null }, open)).toEqual({
      list: "foxThanksPredictionNoLoser",
      values: {},
      show: "none",
    });
  });

  it("des perdants sans issue connue sont traités comme sans perdant : jamais « Perdants sur  : »", () => {
    expect(toThanksPlan({ kind: "prediction", losers: 3, outcome: null }, open).list).toBe(
      "foxThanksPredictionNoLoser",
    );
  });
});
