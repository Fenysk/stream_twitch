import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chat.schema";
import { CHAT_AFTER_MS, CHAT_KEPT_MS, toClipChat, toKeptMessages } from "./clip-chat.rules";

const message = (id: string, receivedAt: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  nickname: "Viewer",
  color: "#ff0000",
  fragments: [{ kind: "text", text: id }],
  isHidden: false,
  receivedAt,
  ...overrides,
});

const SAVED_AT = 1_000_000;

describe("les messages gardés en mémoire", () => {
  it("garde 3 minutes de tchat et rien de plus ancien", () => {
    expect(CHAT_KEPT_MS).toBe(180_000);
    const now = SAVED_AT;
    const messages = [
      message("vieux", now - CHAT_KEPT_MS - 1),
      message("limite", now - CHAT_KEPT_MS),
      message("neuf", now),
    ];
    expect(toKeptMessages(messages, now).map(({ id }) => id)).toEqual(["limite", "neuf"]);
  });

  it("garde l'ordre d'arrivée et ne modifie pas la liste reçue", () => {
    const messages = [message("a", 10), message("b", 20)];
    const kept = toKeptMessages(messages, 100);
    expect(kept).toEqual(messages);
    expect(kept).not.toBe(messages);
  });
});

describe("le tchat d'un clip", () => {
  it("attend 10 s après la sauvegarde", () => {
    expect(CHAT_AFTER_MS).toBe(10_000);
  });

  it("garde les messages de [sauvegarde − durée du clip, sauvegarde + 10 s], bornes comprises", () => {
    const durationMs = 118_550;
    const messages = [
      message("trop-tôt", SAVED_AT - durationMs - 1),
      message("début", SAVED_AT - durationMs),
      message("milieu", SAVED_AT - 60_000),
      message("sauvegarde", SAVED_AT),
      message("réaction", SAVED_AT + 9000),
      message("fin", SAVED_AT + CHAT_AFTER_MS),
      message("trop-tard", SAVED_AT + CHAT_AFTER_MS + 1),
    ];
    const chat = toClipChat(messages, SAVED_AT, durationMs);
    expect(chat.savedAt).toBe(SAVED_AT);
    expect(chat.messages.map(({ id }) => id)).toEqual(["début", "milieu", "sauvegarde", "réaction", "fin"]);
  });

  it("garde les messages tels que la page du tchat les reçoit : fragments, couleur et masquage compris", () => {
    const hidden = message("commande", SAVED_AT - 5000, {
      isHidden: true,
      color: null,
      fragments: [
        { kind: "text", text: "!lurk " },
        { kind: "emote", id: "25", name: "Kappa" },
      ],
    });
    expect(toClipChat([hidden], SAVED_AT, 60_000).messages).toEqual([hidden]);
  });

  it("remonte jusqu'à 3 minutes avant la sauvegarde quand la durée du clip est inconnue", () => {
    const messages = [
      message("trop-tôt", SAVED_AT - CHAT_KEPT_MS - 1),
      message("limite", SAVED_AT - CHAT_KEPT_MS),
    ];
    expect(toClipChat(messages, SAVED_AT, undefined).messages.map(({ id }) => id)).toEqual(["limite"]);
  });

  it("rend une liste vide, et l'heure de la sauvegarde, quand personne n'a écrit", () => {
    expect(toClipChat([], SAVED_AT, 118_550)).toEqual({ savedAt: SAVED_AT, messages: [] });
  });
});
