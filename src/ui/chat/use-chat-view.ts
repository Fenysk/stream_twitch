import { useEffect, useState } from "react";
import { type ChatState, EMPTY_CHAT_STATE, toNextChatState } from "../../domain/chat-state.rules";
import { watchChat } from "./chat-stream";

// La page ne connaît que le flux du serveur : le tchat d'OBS (messages montrés selon l'allure, les 100 derniers).
export const useChatView = (): ChatState => {
  const [state, setState] = useState<ChatState>(EMPTY_CHAT_STATE);
  useEffect(() => watchChat((event) => setState((current) => toNextChatState(current, event))), []);
  return state;
};
