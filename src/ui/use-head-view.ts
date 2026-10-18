import { useEffect, useState } from "react";
import type { HeadView } from "../domain/head.types";
import { createExpressionGate, type ExpressionGate } from "./expression-gate";
import { type ImageUrls, toImageUrls } from "./expression-urls";
import { toHeadListener } from "./head-listener";
import { preloadExpression } from "./preload-images";

export type ShownHead = { view: HeadView; images: ImageUrls };

const RETRY_MS = 2000;

// Le portail des expressions d'une page qui montre la tête (`/head`, `/show`) : une nouvelle expression (ou une nouvelle version après
// une retouche) ne s'affiche qu'une fois ses deux images chargées ; en attendant, l'ancienne reste à l'écran.
export const createHeadGate = (onShown: (shown: ShownHead) => void): ExpressionGate =>
  createExpressionGate({
    preload: preloadExpression,
    show: (view) => onShown({ view, images: toImageUrls(view.expression) }),
    onError: (error) => console.error("Expression : images non chargées, l'ancienne reste affichée", error),
    retryMs: RETRY_MS,
  });

// La page ne connaît que le flux du serveur : EventSource se reconnecte seul s'il tombe. Une nouvelle expression ne
// s'affiche qu'une fois ses images chargées (expression-gate.ts) : aucune tête vide ni clignotement en stream.
export const useHeadView = (): ShownHead | null => {
  const [shown, setShown] = useState<ShownHead | null>(null);
  useEffect(() => {
    const gate = createHeadGate(setShown);
    const source = new EventSource("/api/head/events");
    source.onmessage = toHeadListener(gate.receive);
    return () => source.close();
  }, []);
  return shown;
};
