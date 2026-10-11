// Le portail d'expression de la page `/head` : une nouvelle expression (ou une nouvelle version après une retouche) ne
// s'affiche qu'une fois ses deux images chargées. En attendant, l'ancienne reste à l'écran : aucun clignotement, jamais
// de tête vide en stream. Les vues qui arrivent pendant le chargement sont retenues, seule la dernière compte.

import type { ExpressionRef, HeadView } from "../domain/head.types";
import { toExpressionKey } from "./expression-urls";

export type ExpressionGateDeps = {
  preload: (expression: ExpressionRef) => Promise<void>;
  show: (view: HeadView) => void;
  onError: (error: unknown) => void;
  retryMs: number;
};

export type ExpressionGate = { receive(view: HeadView): void };

export function createExpressionGate({
  preload,
  show,
  onError,
  retryMs,
}: ExpressionGateDeps): ExpressionGate {
  const loaded = new Set<string>();
  let loading = false;
  let latest: HeadView | undefined;

  const receive = (view: HeadView): void => {
    latest = view;
    const key = toExpressionKey(view.expression);
    if (loaded.has(key)) {
      show(view);
      return;
    }
    if (loading) return;
    loading = true;
    preload(view.expression).then(
      () => {
        loaded.add(key);
        loading = false;
        if (latest) receive(latest);
      },
      (error: unknown) => {
        onError(error);
        setTimeout(() => {
          loading = false;
          if (latest) receive(latest);
        }, retryMs);
      },
    );
  };

  return { receive };
}
