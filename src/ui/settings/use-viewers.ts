// Le nombre de viewers du live, relu toutes les 30 s tant que la page Direct est ouverte : le serveur le garde déjà (il le relit
// chez Twitch toutes les 60 s), une demande de plus ne coûte donc rien à Twitch.

import { useEffect, useState } from "react";
import type { ViewersState } from "../../domain/viewers.types";
import { getViewers } from "../twitch-api";

const POLL_MS = 30_000;

export type UseViewers = {
  // `null` tant que le serveur n'a pas répondu.
  viewers: ViewersState | null;
  // Pourquoi le nombre n'a pas pu être lu.
  error: string | null;
};

export const useViewers = (): UseViewers => {
  const [viewers, setViewers] = useState<ViewersState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isLive = true;
    const refresh = async () => {
      const answer = await getViewers();
      if (!isLive) return;
      if (answer.ok) {
        setViewers(answer.value);
        setError(null);
      } else setError(answer.message);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      isLive = false;
      clearInterval(timer);
    };
  }, []);

  return { viewers, error };
};
