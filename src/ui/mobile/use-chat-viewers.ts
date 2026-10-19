import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatViewer } from "../../domain/chat-viewers.schema";
import { listChatViewers } from "../control-api";
import { toSentence } from "./control-keys";

// La liste des viewers : en cours de lecture chez Twitch, lue, ou refusée (il faut reconnecter Twitch pour ce droit, le compte n'est pas
// modérateur…) avec la phrase à montrer.
export type ChatViewersView =
  | { kind: "loading" }
  | { kind: "ready"; chatViewers: ChatViewer[] }
  | { kind: "failed"; message: string };

// La liste se lit à chaque ouverture de la feuille (`isOpen`), et à la demande (`refresh`). Une réponse qui arrive après une demande plus
// récente, ou après la fermeture de la feuille, est ignorée.
export const useChatViewers = (isOpen: boolean): { view: ChatViewersView; refresh: () => Promise<void> } => {
  const [view, setView] = useState<ChatViewersView>({ kind: "loading" });
  const turn = useRef(0);

  const refresh = useCallback(async () => {
    turn.current += 1;
    const mine = turn.current;
    setView({ kind: "loading" });
    const answer = await listChatViewers();
    if (mine !== turn.current) return;
    setView(
      answer.ok
        ? { kind: "ready", chatViewers: answer.value }
        : { kind: "failed", message: toSentence(answer.message) },
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    return () => {
      turn.current += 1;
    };
  }, [isOpen, refresh]);

  return { view, refresh };
};
