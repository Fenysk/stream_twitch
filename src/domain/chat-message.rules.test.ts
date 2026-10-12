import { describe, expect, it } from "vitest";
import type { RawMessage } from "./chat.types";
import { toChatMessage } from "./chat-message.rules";

const raw = (overrides: Partial<RawMessage> = {}): RawMessage => ({
  id: "msg-1",
  viewerId: "42",
  viewerLogin: "alice",
  nickname: "Alice",
  color: "#1E90FF",
  text: "Salut Kappa",
  emotes: [{ id: "25", start: 6, end: 10 }],
  isCommand: false,
  ...overrides,
});

describe("toChatMessage", () => {
  it("garde l'identifiant, le nickname, la couleur et l'heure, et découpe le texte en fragments", () => {
    expect(toChatMessage(raw(), [], 1234)).toEqual({
      id: "msg-1",
      nickname: "Alice",
      color: "#1E90FF",
      fragments: [
        { kind: "text", text: "Salut " },
        { kind: "emote", id: "25", name: "Kappa" },
      ],
      isHidden: false,
      receivedAt: 1234,
    });
  });

  it("masque une commande", () => {
    expect(toChatMessage(raw({ text: "!lurk", emotes: [], isCommand: true }), [], 0).isHidden).toBe(true);
  });

  it("masque les messages d'un bot de la liste, sans tenir compte des majuscules", () => {
    const bots = ["nightbot", "streamelements"];
    expect(toChatMessage(raw({ viewerLogin: "Nightbot" }), bots, 0).isHidden).toBe(true);
    expect(toChatMessage(raw({ viewerLogin: "alice" }), bots, 0).isHidden).toBe(false);
  });

  it("n'envoie pas une couleur qui n'est pas #RRGGBB : elle redevient la couleur par défaut", () => {
    expect(toChatMessage(raw({ color: "red" }), [], 0).color).toBeNull();
    expect(toChatMessage(raw({ color: null }), [], 0).color).toBeNull();
  });
});
