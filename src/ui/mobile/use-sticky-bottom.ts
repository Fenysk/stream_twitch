import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  INITIAL_STICK,
  type StickState,
  shouldFollowResize,
  toStickAfterJump,
  toStickAfterMessages,
  toStickAfterScroll,
} from "./chat-scroll";

export type StickyBottom = {
  scroller: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLOListElement | null>;
  hasNews: boolean;
  onScroll: () => void;
  jump: () => void;
};

// Une zone de messages qui reste collée en bas (règles dans chat-scroll.ts). `messageCount` : le nombre de messages montrés, dont la hausse dit
// que des messages sont arrivés. Le bas se retrouve aussi quand la zone change de taille sans message nouveau (le champ « Écrire » qui s'ouvre
// avec le clavier, une emote qui se charge) : `scroller` et `content` sont observés.
export const useStickyBottom = (messageCount: number): StickyBottom => {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLOListElement>(null);
  const stick = useRef<StickState>(INITIAL_STICK);
  const counted = useRef(0);
  const [hasNews, setHasNews] = useState(false);

  const update = useCallback((next: StickState) => {
    stick.current = next;
    setHasNews(next.hasNews);
  }, []);

  // Le défilement est instantané : une animation passerait par des positions « pas en bas », que la zone prendrait pour un départ de lecture.
  const scrollToBottom = useCallback(() => {
    const zone = scroller.current;
    if (zone) zone.scrollTop = zone.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const added = messageCount - counted.current;
    counted.current = messageCount;
    const next = toStickAfterMessages(stick.current, added);
    update(next.state);
    if (next.shouldScroll) scrollToBottom();
  }, [messageCount, update, scrollToBottom]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (shouldFollowResize(stick.current)) scrollToBottom();
    });
    for (const element of [scroller.current, content.current]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const onScroll = useCallback(() => {
    const zone = scroller.current;
    if (zone) update(toStickAfterScroll(stick.current, zone));
  }, [update]);

  const jump = useCallback(() => {
    update(toStickAfterJump());
    scrollToBottom();
  }, [update, scrollToBottom]);

  return { scroller, content, hasNews, onScroll, jump };
};
