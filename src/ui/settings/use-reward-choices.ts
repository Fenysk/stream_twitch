// Les récompenses de la chaîne que Twitch connaît, lues à l'ouverture de l'onglet et sur « Rafraîchir » : celles qui n'ont pas
// encore de son (pour en relier une), et les sons dont la récompense a disparu de Twitch.

import { useCallback, useEffect, useState } from "react";
import type { RewardChoices } from "../../domain/sound.schema";
import { listRewardChoices } from "../sounds-api";

export type UseRewardChoices = {
  // `null` tant que Twitch n'a pas répondu, ou quand il a refusé (`error` dit pourquoi).
  rewards: RewardChoices | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export const useRewardChoices = (): UseRewardChoices => {
  const [rewards, setRewards] = useState<RewardChoices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const answer = await listRewardChoices();
    setIsLoading(false);
    setRewards(answer.ok ? answer.value : null);
    setError(answer.ok ? null : answer.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rewards, error, isLoading, refresh };
};
