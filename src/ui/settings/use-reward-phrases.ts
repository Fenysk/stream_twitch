// Les phrases de Jean-Renard de chaque récompense de la chaîne, lues à l'ouverture de l'onglet et sur « Rafraîchir ».

import { useCallback, useEffect, useState } from "react";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import { listRewardPhrases, testRewardPhrases, updateRewardPhrases } from "../reward-phrases-api";

export type UseRewardPhrases = {
  // `null` tant que Twitch n'a pas répondu, ou quand il a refusé (`error` dit pourquoi).
  rewards: RewardPhrasesEntry[] | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  // Remplace les phrases d'une récompense ; rend le refus à montrer, ou `null` quand elles sont gardées.
  save: (id: string, phrases: string[]) => Promise<string | null>;
  // « Tester » : le renard dit une phrase de la récompense ; rend le refus à montrer, ou `null`.
  test: (id: string) => Promise<string | null>;
};

export const useRewardPhrases = (): UseRewardPhrases => {
  const [rewards, setRewards] = useState<RewardPhrasesEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const answer = await listRewardPhrases();
    setIsLoading(false);
    setRewards(answer.ok ? answer.value : null);
    setError(answer.ok ? null : answer.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Une récompense disparue de Twitch dont on retire les phrases n'a plus rien à montrer.
  const save = useCallback(async (id: string, phrases: string[]): Promise<string | null> => {
    const answer = await updateRewardPhrases(id, phrases);
    if (!answer.ok) return answer.message;
    setRewards((current) =>
      (current ?? [])
        .map((entry) => (entry.id === id ? { ...entry, phrases: answer.value } : entry))
        .filter(({ isMissing, phrases: kept }) => !isMissing || kept.length > 0),
    );
    return null;
  }, []);

  const test = useCallback(async (id: string): Promise<string | null> => {
    const answer = await testRewardPhrases(id);
    return answer.ok ? null : answer.message;
  }, []);

  return { rewards, error, isLoading, refresh, save, test };
};
