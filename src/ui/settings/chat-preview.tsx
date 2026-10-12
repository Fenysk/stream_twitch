// L'aperçu en direct de l'onglet « Tchat » : la colonne de la page /chat, à la taille de la source OBS et réduite, nourrie par
// le même flux (les vrais messages, l'allure appliquée). Des messages de test y défilent d'eux-mêmes, mêlés aux vrais : ils
// restent dans cet onglet, ne passent jamais par le serveur, donc jamais dans OBS.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../domain/chat.schema";
import { toSampleMessage } from "../../domain/chat-sample.rules";
import { ChatColumn } from "../chat/chat-column";
import { useChatView } from "../chat/use-chat-view";

const SAMPLE_EVERY_MS = 2500;
const KEPT_SAMPLES = 30;

export const ChatPreview = () => {
  const { messages, look } = useChatView();
  const [samples, setSamples] = useState<ChatMessage[]>([]);
  // Le rang du prochain message de test : hors de l'effet, pour que les identifiants restent uniques si l'effet repart.
  const sent = useRef(0);
  useEffect(() => {
    const send = () => {
      const message = toSampleMessage(sent.current, Date.now());
      sent.current += 1;
      if (message) setSamples((current) => [...current, message].slice(-KEPT_SAMPLES));
    };
    send();
    const timer = setInterval(send, SAMPLE_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  const shown = useMemo(
    () => [...messages, ...samples].sort((first, second) => first.receivedAt - second.receivedAt),
    [messages, samples],
  );
  return (
    <div className="chat-preview-stage settings-checker" role="log" aria-label="Aperçu du tchat">
      <div className="chat-preview-scale">
        {look && <ChatColumn messages={shown} look={look} layout="box" />}
      </div>
    </div>
  );
};
