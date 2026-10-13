// L'état de la connexion à Twitch, relu toutes les 3 s tant que l'onglet est ouvert : Alexis autorise dans un autre onglet, et
// celui-ci le voit passer à « connecté » sans qu'il ait rien à faire.

import { useCallback, useEffect, useState } from "react";
import type { TwitchStatus } from "../../domain/twitch.schema";
import { disconnectTwitch, getTwitchStatus } from "../twitch-api";

const POLL_MS = 3000;

export type UseTwitch = {
  // `null` tant que le serveur n'a pas répondu.
  status: TwitchStatus | null;
  error: string | null;
  isBusy: boolean;
  disconnect: () => Promise<void>;
};

export const useTwitch = (): UseTwitch => {
  const [status, setStatus] = useState<TwitchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isLive = true;
    const refresh = async () => {
      const answer = await getTwitchStatus();
      if (!isLive) return;
      if (answer.ok) {
        setStatus(answer.value);
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

  const disconnect = useCallback(async () => {
    setIsBusy(true);
    const answer = await disconnectTwitch();
    setIsBusy(false);
    if (answer.ok) {
      setStatus(answer.value);
      setError(null);
    } else setError(answer.message);
  }, []);

  return { status, error, isBusy, disconnect };
};
