import { useEffect, useState } from "react";
import type { HeadView } from "../domain/head.types";
import { HeadViewSchema } from "../domain/head-view.schema";

// La page ne connaît que le flux du serveur : EventSource se reconnecte seul s'il tombe.
export const useHeadView = (): HeadView | null => {
  const [view, setView] = useState<HeadView | null>(null);
  useEffect(() => {
    const source = new EventSource("/api/head/events");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = HeadViewSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) setView(parsed.data);
      else console.error("Message du serveur illisible :", parsed.error.message);
    };
    return () => source.close();
  }, []);
  return view;
};
