// La liste des sons du serveur côté page : lue à l'ouverture de l'onglet, relue après chaque ajout, modification ou suppression.

import { useCallback, useEffect, useState } from "react";
import type { SoundSummary } from "../../domain/sound.schema";
import { listSounds } from "../sounds-api";

export type UseSounds = {
  // `null` tant que le serveur n'a pas répondu.
  sounds: SoundSummary[] | null;
  refresh: () => Promise<void>;
};

export const useSounds = (): UseSounds => {
  const [sounds, setSounds] = useState<SoundSummary[] | null>(null);

  const refresh = useCallback(async () => {
    const answer = await listSounds();
    if (answer.ok) setSounds(answer.value);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sounds, refresh };
};
