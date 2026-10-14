import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RawMessage } from "./chat.types";
import {
  type ChatFilterRules,
  type FilterReason,
  hasWaitedTooLong,
  isOwnMessage,
  isTooSoon,
  toChatSpeech,
  toReadRules,
  toReasonText,
  toWaitText,
} from "./chat-filter.rules";
import { toInsultList } from "./chat-insults.rules";
import { toChatBots } from "./chat-settings.rules";
import { type Settings, SettingsSchema } from "./settings.schema";

const rules: ChatFilterRules = {
  maxLength: 150,
  capitalsMaxLength: 15,
  emoteNames: ["KEKW", "OMEGALUL"],
  bots: ["nightbot", "streamelements"],
  insults: toInsultList("connard\nsalope\n=con\n=pd"),
};

const raw = (text: string, overrides: Partial<RawMessage> = {}): RawMessage => ({
  id: "m1",
  viewerId: "42",
  viewerLogin: "alice",
  nickname: "Alice",
  color: null,
  text,
  emotes: [],
  isCommand: false,
  ...overrides,
});

const reasonOf = (message: RawMessage, custom: ChatFilterRules = rules): FilterReason | null => {
  const speech = toChatSpeech(message, custom);
  return speech.ok ? null : speech.reason;
};

describe("toChatSpeech : les comptes ignorés", () => {
  it("ignore WZBot, quelle que soit la casse du compte ou de la liste", () => {
    const bots = toChatBots({ chatBots: ["WZBot"] });
    expect(reasonOf(raw("Bienvenue !", { viewerLogin: "wzbot" }), { ...rules, bots })).toEqual({
      family: "bot",
    });
    expect(reasonOf(raw("Bienvenue !", { viewerLogin: "WZBot" }), { ...rules, bots })).toEqual({
      family: "bot",
    });
    expect(reasonOf(raw("Bienvenue !", { viewerLogin: "alice" }), { ...rules, bots })).toBeNull();
  });

  it("ignore WZBot avec la liste de settings.json", () => {
    const file: unknown = JSON.parse(readFileSync("settings.json", "utf8"));
    const bots = toChatBots(SettingsSchema.parse(file));
    expect(reasonOf(raw("Bienvenue !", { viewerLogin: "WZBot" }), { ...rules, bots })).toEqual({
      family: "bot",
    });
  });
});

describe("toChatSpeech : un message ordinaire", () => {
  it("rend le texte seul, sans le nickname", () => {
    expect(toChatSpeech(raw("Salut tout le monde !"), rules)).toEqual({
      ok: true,
      text: "Salut tout le monde !",
    });
  });

  it("retire les emotes de Twitch et celles de la liste, et réduit les blancs", () => {
    const message = raw("Salut Kappa le monde KEKW", { emotes: [{ id: "25", start: 6, end: 10 }] });
    expect(toChatSpeech(message, rules)).toEqual({ ok: true, text: "Salut le monde" });
  });
});

describe("toChatSpeech : les mentions", () => {
  it("lit une mention d'ouverture sans arobase, suivie d'une virgule", () => {
    expect(toChatSpeech(raw("@Benitoad t'as vu ça ?"), rules)).toEqual({
      ok: true,
      text: "Benitoad, t'as vu ça ?",
    });
  });

  it("lit une mention au milieu sans arobase seulement", () => {
    expect(toChatSpeech(raw("merci @Benitoad"), rules)).toEqual({ ok: true, text: "merci Benitoad" });
  });

  it("retire du texte lu un nickname cité que la liste d'insultes refuse", () => {
    expect(toChatSpeech(raw("@connard salut"), rules)).toEqual({ ok: true, text: "salut" });
    expect(toChatSpeech(raw("merci @xX_connard_Xx"), rules)).toEqual({ ok: true, text: "merci" });
  });

  it("ignore un message qui n'est qu'un nickname refusé, en disant l'insulte", () => {
    expect(reasonOf(raw("@connard"))).toEqual({ family: "insult", entry: "connard" });
  });

  it("juge toujours le reste du message : une insulte à côté d'une mention est ignorée", () => {
    expect(reasonOf(raw("@Benitoad t'es con"))).toEqual({ family: "insult", entry: "con" });
  });
});

describe("toChatSpeech : famille 1, les commandes et les bots", () => {
  it("ignore une commande", () => {
    expect(reasonOf(raw("!lurk", { isCommand: true }))).toEqual({ family: "command" });
  });

  it("ignore un bot connu, sans tenir compte des majuscules", () => {
    expect(reasonOf(raw("Pensez à suivre !", { viewerLogin: "NightBot" }))).toEqual({ family: "bot" });
  });

  it("réutilise la règle de l'affichage : un viewer qui n'est pas un bot est lu", () => {
    expect(reasonOf(raw("Pensez à suivre !", { viewerLogin: "alice" }))).toBeNull();
  });
});

describe("toChatSpeech : famille 2, les liens, les adresses mail et les numéros", () => {
  it.each([
    ["va voir https://exemple.com", "link"],
    ["écris à moi@exemple.fr", "email"],
    ["appelle le 06 12 34 56 78", "phone"],
  ])("ignore : %s", (text, kind) => {
    expect(reasonOf(raw(text))).toEqual({ family: "contact", kind });
  });
});

describe("toChatSpeech : famille 3, la longueur", () => {
  it("lit un message de 150 caractères", () => {
    const text = Array.from({ length: 40 }, (_, index) => `mot${index}`)
      .join(" ")
      .slice(0, 150)
      .trim();
    expect(Array.from(text).length).toBeGreaterThan(140);
    expect(reasonOf(raw(text))).toBeNull();
  });

  it("ignore un message de plus de 150 caractères, et dit sa longueur", () => {
    const text = "bonjour ".repeat(19).trim();
    expect(text.length).toBeGreaterThan(150);
    expect(reasonOf(raw(text))).toEqual({ family: "length", length: text.length, max: 150 });
  });

  it("compte des caractères, pas des unités UTF-16 : 100 emojis ne font pas 200", () => {
    const text = "ça va ? ".repeat(10) + "😀 ".repeat(30).trim();
    expect(Array.from(text).length).toBeLessThanOrEqual(150);
    expect(text.length).toBeGreaterThan(150);
    expect(reasonOf(raw(text))?.family).not.toBe("length");
  });

  it("suit la longueur réglée", () => {
    expect(reasonOf(raw("un message assez court"), { ...rules, maxLength: 10 })).toMatchObject({
      family: "length",
      max: 10,
    });
  });

  it("mesure le message brut, emotes comprises", () => {
    const text = `${"Kappa ".repeat(30)}fin`;
    const ranges = Array.from({ length: 30 }, (_, index) => ({
      id: "25",
      start: index * 6,
      end: index * 6 + 4,
    }));
    expect(reasonOf(raw(text, { emotes: ranges }))).toMatchObject({ family: "length" });
  });
});

describe("toChatSpeech : famille 4, le spam", () => {
  it.each([
    ["lol lol lol lol", "repetition"],
    ["aaaaaaaaaa", "letters"],
    ["SALUT TOUT LE MONDE", "capitals"],
    ["⣿⣿⣿⣿⣿⣿⣿⣿", "drawing"],
  ])("ignore : %s", (text, kind) => {
    expect(reasonOf(raw(text))).toEqual({ family: "spam", kind });
  });
});

describe("toChatSpeech : les majuscules d'un message court", () => {
  it.each(["GG", "MDR", "JEANRENARD"])("lit : %s", (text) => {
    expect(toChatSpeech(raw(text), rules)).toEqual({ ok: true, text });
  });

  it("ignore toujours un long message en majuscules", () => {
    expect(reasonOf(raw("SALUT TOUT LE MONDE"))).toEqual({ family: "spam", kind: "capitals" });
  });

  it("suit le maximum réglé", () => {
    expect(reasonOf(raw("JEANRENARD"), { ...rules, capitalsMaxLength: 5 })).toEqual({
      family: "spam",
      kind: "capitals",
    });
  });

  it("applique les autres règles du spam à un message court", () => {
    expect(reasonOf(raw("GG GG GG GG"))).toEqual({ family: "spam", kind: "repetition" });
  });
});

describe("toChatSpeech : le spam se juge sur le texte lu", () => {
  it("ne prend pas pour un cri le nom d'une emote écrit en majuscules", () => {
    expect(toChatSpeech(raw("OMEGALUL bien joué"), rules)).toEqual({ ok: true, text: "bien joué" });
  });

  it("ne prend pas pour un spam une même emote répétée : il n'en reste rien à dire", () => {
    expect(reasonOf(raw("KEKW KEKW KEKW KEKW KEKW"))).toEqual({ family: "emotes" });
  });
});

describe("toChatSpeech : famille 5, les emotes", () => {
  it("ignore un message qui n'est que des emotes de Twitch", () => {
    const message = raw("Kappa Kappa", {
      emotes: [
        { id: "25", start: 0, end: 4 },
        { id: "25", start: 6, end: 10 },
      ],
    });
    expect(reasonOf(message)).toEqual({ family: "emotes" });
  });

  it("ignore un message qui n'est que des emotes de la liste, ou des deux sortes", () => {
    expect(reasonOf(raw("KEKW OMEGALUL"))).toEqual({ family: "emotes" });
    expect(reasonOf(raw("Kappa KEKW", { emotes: [{ id: "25", start: 0, end: 4 }] }))).toEqual({
      family: "emotes",
    });
  });

  it("ne confond pas un message vide avec un message d'emotes : le texte restant est lu", () => {
    expect(toChatSpeech(raw("KEKW bien joué"), rules)).toEqual({ ok: true, text: "bien joué" });
  });
});

describe("toChatSpeech : famille 6, les insultes", () => {
  it.each(["quel connard", "c0nn4rd", "c o n n a r d", "espèce de SALOPE", "t'es con", "sale PD"])(
    "ignore : %s",
    (text) => {
      expect(reasonOf(raw(text))?.family).toBe("insult");
    },
  );

  it("dit l'entrée de la liste qui a joué", () => {
    expect(reasonOf(raw("c0nn4rd"))).toEqual({ family: "insult", entry: "connard" });
  });

  it("cherche dans le texte lu : le nom d'une emote ne peut pas déclencher la liste", () => {
    const custom: ChatFilterRules = { ...rules, emoteNames: ["conSalope"] };
    expect(reasonOf(raw("conSalope bien joué"), custom)).toBeNull();
  });

  it("laisse passer un message ordinaire proche d'une entrée : « concert », « conducteur »", () => {
    expect(reasonOf(raw("le concert du conducteur"))).toBeNull();
  });
});

describe("toChatSpeech : l'ordre des familles", () => {
  it("donne la première famille qui joue : une commande avec un lien est une commande", () => {
    expect(reasonOf(raw("!promo https://exemple.com", { isCommand: true }))).toEqual({ family: "command" });
  });

  it("donne le lien avant la longueur et le spam", () => {
    expect(reasonOf(raw(`https://exemple.com ${"a".repeat(200)}`))).toEqual({
      family: "contact",
      kind: "link",
    });
  });

  it("donne la longueur avant le spam", () => {
    expect(reasonOf(raw("a".repeat(200)))?.family).toBe("length");
  });
});

describe("isOwnMessage", () => {
  it("reconnaît les messages du compte de la chaîne, sans tenir compte des majuscules", () => {
    expect(isOwnMessage(raw("salut", { viewerLogin: "Fenysk" }), "fenysk")).toBe(true);
    expect(isOwnMessage(raw("salut", { viewerLogin: "alice" }), "fenysk")).toBe(false);
  });
});

describe("isTooSoon : un message par viewer toutes les 10 s", () => {
  it("ne retient pas un viewer qui n'a rien dit", () => {
    expect(isTooSoon(undefined, 5000, 10_000)).toBe(false);
  });

  it("retient un second message arrivé avant la fin du délai", () => {
    expect(isTooSoon(1000, 10_999, 10_000)).toBe(true);
  });

  it("laisse passer un message arrivé à la fin du délai, ou après", () => {
    expect(isTooSoon(1000, 11_000, 10_000)).toBe(false);
    expect(isTooSoon(1000, 60_000, 10_000)).toBe(false);
  });
});

describe("hasWaitedTooLong : un message qui attend plus de 2 min n'est plus lu", () => {
  it("garde un message qui attend depuis moins de 2 min, ou 2 min pile", () => {
    expect(hasWaitedTooLong(0, 119_999, 120_000)).toBe(false);
    expect(hasWaitedTooLong(0, 120_000, 120_000)).toBe(false);
  });

  it("retire un message qui attend depuis 2 min 1 s", () => {
    expect(hasWaitedTooLong(0, 121_000, 120_000)).toBe(true);
    expect(hasWaitedTooLong(50_000, 171_001, 120_000)).toBe(true);
  });
});

describe("toWaitText : une durée pour le journal du serveur", () => {
  it.each<[number, string]>([
    [120_000, "2 min"],
    [60_000, "1 min"],
    [300_000, "5 min"],
    [90_000, "90 s"],
    [30_000, "30 s"],
    [1500, "1,5 s"],
  ])("%d ms s'écrit %s", (ms, text) => {
    expect(toWaitText(ms)).toBe(text);
  });
});

describe("toReasonText : le journal du serveur, en français", () => {
  it.each<[FilterReason, string]>([
    [{ family: "command" }, "commande"],
    [{ family: "bot" }, "bot connu"],
    [{ family: "contact", kind: "link" }, "lien"],
    [{ family: "contact", kind: "email" }, "adresse mail"],
    [{ family: "contact", kind: "phone" }, "numéro de téléphone"],
    [{ family: "length", length: 212, max: 150 }, "trop long : 212 caractères, 150 au plus"],
    [{ family: "spam", kind: "repetition" }, "spam : mot répété"],
    [{ family: "spam", kind: "letters" }, "spam : lettres répétées"],
    [{ family: "spam", kind: "capitals" }, "spam : majuscules"],
    [{ family: "spam", kind: "drawing" }, "spam : dessin en caractères"],
    [{ family: "emotes" }, "il ne reste que des emotes"],
    [{ family: "insult", entry: "connard" }, "insulte : « connard »"],
    [{ family: "own" }, "message du compte de la chaîne"],
    [{ family: "pace", gap: 10_000 }, "même viewer lu il y a moins de 10 s"],
    [{ family: "queue", size: 3 }, "file pleine : 3 messages"],
  ])("%j", (reason, text) => {
    expect(toReasonText(reason)).toBe(text);
  });
});

describe("toReadRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };
  const fox: Settings = {
    ...base,
    foxVoice: "Microsoft Claude",
    foxSmallThreshold: -36,
    foxMediumThreshold: -22,
    foxLargeChance: 0.3,
    foxBounce: 0.03,
    foxBreathPeriod: 4000,
    foxBreath: 0.015,
    foxGazeMin: 5000,
    foxGazeMax: 15000,
    foxBlinkMin: 3000,
    foxBlinkMax: 6000,
    foxBlinkDuration: 150,
    foxListenMin: 2000,
    foxListenMax: 4000,
    foxReadSilence: 1000,
    foxStopAfter: 1000,
    foxReactionDuration: 1000,
    foxJoyDuration: 800,
    foxAwayAfter: 180_000,
    foxCrouchDuration: 300,
    foxJumpDuration: 400,
    foxDiveDuration: 800,
    foxReturnDuration: 800,
    foxYawnDuration: 2000,
    foxShouldReadChat: true,
    foxShouldReadOwn: false,
    foxReadMaxLength: 150,
    foxCapitalsMaxLength: 15,
    foxReadGap: 10_000,
    foxReadQueueSize: 3,
    foxEmoteNames: ["KEKW"],
  };

  it("reprend les réglages de la lecture sous des noms courts", () => {
    expect(toReadRules(fox)).toEqual({
      shouldReadChat: true,
      shouldReadOwn: false,
      maxLength: 150,
      capitalsMaxLength: 15,
      gap: 10_000,
      queueSize: 3,
      emoteNames: ["KEKW"],
    });
  });

  it("ne donne aucune règle quand settings.json n'a pas les réglages du renard", () => {
    expect(toReadRules(base)).toBeUndefined();
  });
});
