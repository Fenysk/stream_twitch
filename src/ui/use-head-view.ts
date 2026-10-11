import { useEffect, useState } from "react";
import type { HeadView } from "../domain/head.types";
import { HeadViewSchema } from "../domain/head-view.schema";
import { createExpressionGate } from "./expression-gate";
import { type ImageUrls, toImageUrls } from "./expression-urls";
import { preloadExpression } from "./preload-images";

export type ShownHead = { view: HeadView; images: ImageUrls };

const RETRY_MS = 2000;

// La page ne connaît que le flux du serveur : EventSource se reconnecte seul s'il tombe. Une nouvelle expression ne
// s'affiche qu'une fois ses images chargées (expression-gate.ts) : aucune tête vide ni clignotement en stream.
export const useHeadView = (): ShownHead | null => {
  const [shown, setShown] = useState<ShownHead | null>(null);
  useEffect(() => {
    const gate = createExpressionGate({
      preload: preloadExpression,
      show: (view) => setShown({ view, images: toImageUrls(view.expression) }),
      onError: (error) => console.error("Expression : images non chargées, l'ancienne reste affichée", error),
      retryMs: RETRY_MS,
    });
    const source = new EventSource("/api/head/events");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = HeadViewSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) gate.receive(parsed.data);
      else console.error("Message du serveur illisible :", parsed.error.message);
    };
    return () => source.close();
  }, []);
  return shown;
};
