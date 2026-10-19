import { useEffect, useState } from "react";
import { EMPTY_PHONE_CHAT, type PhoneChatState, toNextPhoneChat } from "../../domain/chat-phone.rules";
import { watchChat } from "../chat/chat-stream";

// Le tchat du téléphone : tout ce que le flux du serveur a donné depuis l'ouverture de la page, messages masqués dans OBS et supprimés
// compris (voir chat-phone.rules.ts).
export const usePhoneChat = (): PhoneChatState => {
  const [state, setState] = useState<PhoneChatState>(EMPTY_PHONE_CHAT);
  useEffect(() => watchChat((event) => setState((current) => toNextPhoneChat(current, event))), []);
  return state;
};
