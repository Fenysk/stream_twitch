import type { ChatEvent, ChatLook, ChatMessage } from "./chat.schema";

// Ce que la page sait du tchat : les derniers messages reçus, et l'allure une fois que le serveur l'a donnée.
export type ChatState = { messages: ChatMessage[]; look: ChatLook | null };

export const CHAT_STATE_SIZE = 100;

export const EMPTY_CHAT_STATE: ChatState = { messages: [], look: null };

export const toNextChatState = (state: ChatState, event: ChatEvent): ChatState => {
  switch (event.kind) {
    case "snapshot":
      return { messages: event.messages.slice(-CHAT_STATE_SIZE), look: event.look };
    case "message":
      if (state.messages.some((candidate) => candidate.id === event.message.id)) return state;
      return { ...state, messages: [...state.messages, event.message].slice(-CHAT_STATE_SIZE) };
    case "delete": {
      const deleted = new Set(event.messageIds);
      return { ...state, messages: state.messages.filter((candidate) => !deleted.has(candidate.id)) };
    }
    case "look":
      return { ...state, look: event.look };
  }
};
