import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_LOOK,
  isSameChatLook,
  toChatBots,
  toChatChannel,
  toChatLook,
} from "./chat-settings.rules";
import { SettingsSchema } from "./settings.schema";

describe("toChatLook", () => {
  it("prend les valeurs par défaut quand les réglages ne disent rien", () => {
    expect(toChatLook({})).toEqual(DEFAULT_CHAT_LOOK);
  });

  it("prend les réglages donnés, un par un", () => {
    expect(
      toChatLook({
        chatStyle: "panel",
        chatOpacity: 40,
        chatTextSize: 30,
        chatDuration: 0,
        chatMaxMessages: 12,
        chatAnimation: "pop",
        chatShouldShowHidden: true,
      }),
    ).toEqual({
      style: "panel",
      opacity: 40,
      textSize: 30,
      duration: 0,
      maxMessages: 12,
      animation: "pop",
      shouldShowHidden: true,
    });
  });

  it("garde les valeurs par défaut de settings.json : le code et le fichier disent la même chose", () => {
    const file: unknown = JSON.parse(readFileSync("settings.json", "utf8"));
    const settings = SettingsSchema.parse(file);
    expect(toChatLook(settings)).toEqual(DEFAULT_CHAT_LOOK);
    expect(toChatChannel(settings)).toBe(toChatChannel({}));
  });
});

describe("isSameChatLook", () => {
  it("compare les sept réglages, un par un", () => {
    expect(isSameChatLook(DEFAULT_CHAT_LOOK, { ...DEFAULT_CHAT_LOOK })).toBe(true);
    expect(isSameChatLook(DEFAULT_CHAT_LOOK, { ...DEFAULT_CHAT_LOOK, opacity: 10 })).toBe(false);
    expect(isSameChatLook(DEFAULT_CHAT_LOOK, { ...DEFAULT_CHAT_LOOK, shouldShowHidden: true })).toBe(false);
  });
});

describe("toChatBots", () => {
  it("rend les noms en minuscules, et aucun bot sans liste", () => {
    expect(toChatBots({ chatBots: ["NightBot", "StreamElements"] })).toEqual(["nightbot", "streamelements"]);
    expect(toChatBots({})).toEqual([]);
  });
});

describe("toChatChannel", () => {
  it("lit la chaîne des réglages, et `fenysk` par défaut", () => {
    expect(toChatChannel({ chatChannel: "autre" })).toBe("autre");
    expect(toChatChannel({})).toBe("fenysk");
  });
});
