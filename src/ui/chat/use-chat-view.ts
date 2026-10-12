import { useEffect, useState } from "react";
import { ChatEventSchema } from "../../domain/chat.schema";
import { type ChatState, EMPTY_CHAT_STATE, toNextChatState } from "../../domain/chat-state.rules";

// La page ne connaît que le flux du serveur : EventSource se reconnecte seul s'il tombe, et le serveur renvoie alors l'état entier.
export const useChatView = (): ChatState => {
  const [state, setState] = useState<ChatState>(EMPTY_CHAT_STATE);
  useEffect(() => {
    const source = new EventSource("/api/chat/events");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = ChatEventSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) setState((current) => toNextChatState(current, parsed.data));
      else console.error("Message du tchat illisible :", parsed.error.message);
    };
    return () => source.close();
  }, []);
  return state;
};
