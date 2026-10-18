// Les scènes d'OBS, lues une fois à l'ouverture de l'onglet Émission.

import { useEffect, useState } from "react";
import { listScenes } from "../obs-api";

export type UseScenes = { scenes: string[] | null; error: string | null };

export const useScenes = (): UseScenes => {
  const [state, setState] = useState<UseScenes>({ scenes: null, error: null });
  useEffect(() => {
    let isLive = true;
    void listScenes().then((answer) => {
      if (isLive)
        setState(answer.ok ? { scenes: answer.value, error: null } : { scenes: null, error: answer.message });
    });
    return () => {
      isLive = false;
    };
  }, []);
  return state;
};
