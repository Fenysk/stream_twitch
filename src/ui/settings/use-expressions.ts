// La liste des expressions du serveur côté page : lue à l'ouverture de l'onglet, relue après chaque enregistrement.

import { useCallback, useEffect, useState } from "react";
import type { ExpressionSummary } from "../../domain/expression.schema";
import { listExpressions } from "../expressions-api";

export type UseExpressions = { expressions: ExpressionSummary[] | null; refresh: () => Promise<void> };

export const useExpressions = (): UseExpressions => {
  const [expressions, setExpressions] = useState<ExpressionSummary[] | null>(null);

  const refresh = useCallback(async () => {
    const answer = await listExpressions();
    if (answer.ok) setExpressions(answer.value);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { expressions, refresh };
};
