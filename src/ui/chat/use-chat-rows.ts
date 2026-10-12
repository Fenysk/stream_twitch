import { type RefObject, useEffect, useRef, useState } from "react";
import type { ChatLook, ChatMessage } from "../../domain/chat.schema";
import {
  type ChatRow,
  toKeptRows,
  toNextRows,
  toNextWake,
  toShownMessages,
} from "../../domain/chat-rows.rules";
import { motionMs } from "../design/motion";

// Les rangées de la colonne : à chaque message ou réglage reçu, et à chaque fin de vie ou de fondu, elles se recalculent.
// Un message qui part reste le temps de son fondu (la durée `--lp-dur-reveal` de tokens.css, que chat.css joue).
export const useChatRows = (
  messages: ChatMessage[],
  look: ChatLook,
  column: RefObject<HTMLElement | null>,
): ChatRow[] => {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const latest = useRef<ChatRow[]>([]);
  useEffect(() => {
    const fadeMs = column.current ? motionMs(column.current, "--lp-dur-reveal") : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const now = Date.now();
      const next = toKeptRows(
        toNextRows(latest.current, toShownMessages(messages, look, now), now),
        now,
        fadeMs,
      );
      latest.current = next;
      setRows(next);
      const wake = toNextWake(next, look, fadeMs);
      if (wake !== null) timer = setTimeout(sync, Math.max(0, wake - Date.now()));
    };
    sync();
    return () => clearTimeout(timer);
  }, [messages, look, column]);
  return rows;
};
