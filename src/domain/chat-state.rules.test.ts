import { describe, expect, it } from "vitest";
import type { ChatLook, ChatMessage } from "./chat.schema";
import { CHAT_STATE_SIZE, EMPTY_CHAT_STATE, toNextChatState } from "./chat-state.rules";

const look: ChatLook = {
  style: "pill",
  opacity: 85,
  textSize: 20,
  duration: 60,
  maxMessages: 8,
  animation: "rise",
  shouldShowHidden: false,
};

const message = (id: string): ChatMessage => ({
  id,
  nickname: "Alice",
  color: null,
  fragments: [{ kind: "text", text: id }],
  isHidden: false,
  receivedAt: 1000,
});

const ids = (messages: ChatMessage[]): string[] => messages.map((candidate) => candidate.id);

describe("toNextChatState", () => {
  it("part sans message et sans allure : la page n'affiche rien avant le premier état du serveur", () => {
    expect(EMPTY_CHAT_STATE).toEqual({ messages: [], look: null });
  });

  it("remplace tout par l'état envoyé à la connexion", () => {
    const state = toNextChatState(EMPTY_CHAT_STATE, { kind: "message", message: message("old") });
    const next = toNextChatState(state, { kind: "snapshot", messages: [message("a"), message("b")], look });
    expect(ids(next.messages)).toEqual(["a", "b"]);
    expect(next.look).toEqual(look);
  });

  it("ajoute un message à la fin, et ignore un message déjà reçu", () => {
    let state = toNextChatState(EMPTY_CHAT_STATE, { kind: "message", message: message("a") });
    state = toNextChatState(state, { kind: "message", message: message("b") });
    state = toNextChatState(state, { kind: "message", message: message("a") });
    expect(ids(state.messages)).toEqual(["a", "b"]);
  });

  it("ne garde que les derniers messages", () => {
    let state = EMPTY_CHAT_STATE;
    for (let count = 0; count < CHAT_STATE_SIZE + 5; count += 1) {
      state = toNextChatState(state, { kind: "message", message: message(`m${count}`) });
    }
    expect(state.messages).toHaveLength(CHAT_STATE_SIZE);
    expect(state.messages[0]?.id).toBe("m5");
    expect(state.messages.at(-1)?.id).toBe(`m${CHAT_STATE_SIZE + 4}`);
  });

  it("retire les messages supprimés, et seulement eux", () => {
    const state = toNextChatState(EMPTY_CHAT_STATE, {
      kind: "snapshot",
      messages: [message("a"), message("b"), message("c")],
      look,
    });
    const next = toNextChatState(state, { kind: "delete", messageIds: ["a", "c", "inconnu"] });
    expect(ids(next.messages)).toEqual(["b"]);
  });

  it("change l'allure sans toucher aux messages", () => {
    const state = toNextChatState(EMPTY_CHAT_STATE, { kind: "snapshot", messages: [message("a")], look });
    const next = toNextChatState(state, { kind: "look", look: { ...look, style: "panel" } });
    expect(next.look?.style).toBe("panel");
    expect(ids(next.messages)).toEqual(["a"]);
  });
});
