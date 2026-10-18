// Les récompenses de la chaîne, lues à l'ouverture de l'onglet et sur « Rafraîchir », avec ce qu'on peut leur faire : en créer,
// modifier ou supprimer celles que l'app gère, choisir le sound de chacune.

import { useCallback, useEffect, useState } from "react";
import type { RewardCreation, RewardSummary } from "../../domain/reward.schema";
import type { RewardFields } from "../../domain/reward.types";
import { createReward, deleteReward, listRewards, updateReward, updateRewardSound } from "../rewards-api";

export type UseRewards = {
  // `null` tant que Twitch n'a pas répondu, ou quand il a refusé (`error` dit pourquoi).
  rewards: RewardSummary[] | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  // Chaque action rend le refus à montrer, ou `null` quand c'est fait.
  createReward: (input: RewardCreation) => Promise<string | null>;
  updateReward: (id: string, fields: RewardFields) => Promise<string | null>;
  deleteReward: (id: string) => Promise<string | null>;
  updateRewardSound: (id: string, sound: string | null) => Promise<string | null>;
};

export const useRewards = (): UseRewards => {
  const [rewards, setRewards] = useState<RewardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const answer = await listRewards();
    setIsLoading(false);
    setRewards(answer.ok ? answer.value : null);
    setError(answer.ok ? null : answer.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Une action qui change la liste de Twitch : la liste se relit.
  const reread = useCallback(
    async (answer: { ok: true } | { ok: false; message: string }): Promise<string | null> => {
      if (!answer.ok) return answer.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  // Un sound choisi n'écrit rien sur Twitch : la ligne change sur place. Un reward disparu de Twitch dont on retire le sound n'a
  // plus rien à montrer.
  const pickSound = useCallback(async (id: string, sound: string | null): Promise<string | null> => {
    const answer = await updateRewardSound(id, sound);
    if (!answer.ok) return answer.message;
    setRewards((current) =>
      (current ?? [])
        .map((reward) => (reward.id === id ? { ...reward, sound: answer.value } : reward))
        .filter(({ isMissing, isManaged, sound: kept }) => !isMissing || isManaged || kept !== null),
    );
    return null;
  }, []);

  return {
    rewards,
    error,
    isLoading,
    refresh,
    createReward: async (input) => reread(await createReward(input)),
    updateReward: async (id, fields) => reread(await updateReward(id, fields)),
    deleteReward: async (id) => reread(await deleteReward(id)),
    updateRewardSound: pickSound,
  };
};
