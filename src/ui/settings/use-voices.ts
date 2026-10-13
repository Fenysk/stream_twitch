// Les voix françaises installées sur le PC, lues une fois à l'ouverture de l'onglet.

import { useEffect, useState } from "react";
import type { Voice } from "../../domain/voice.schema";
import { listVoices } from "../fox-api";

export type UseVoices = { voices: Voice[] | null; error: string | null };

export const useVoices = (): UseVoices => {
  const [state, setState] = useState<UseVoices>({ voices: null, error: null });
  useEffect(() => {
    let isLive = true;
    void listVoices().then((answer) => {
      if (isLive)
        setState(answer.ok ? { voices: answer.value, error: null } : { voices: null, error: answer.message });
    });
    return () => {
      isLive = false;
    };
  }, []);
  return state;
};
