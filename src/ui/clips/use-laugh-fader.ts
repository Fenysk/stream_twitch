// Le volume des rires d'un clip (0 à 100 %) dans l'éditeur. Un clip confirmé montre sa valeur enregistrée (absente : 100) ; un clip brut
// part du dernier volume choisi, retenu par le navigateur, et de 100 % au tout début.

import { useEffect, useState } from "react";
import { DEFAULT_LAUGH_FADER } from "../../domain/laugh.rules";
import { getLastLaughFader, updateLastLaughFader } from "./last-laugh-choice";

export type LaughFader = {
  fader: number;
  update: (fader: number) => void;
};

// `initial` : le volume déjà enregistré du clip ; sans lui, le dernier volume choisi.
export const useLaughFader = (initial: number | undefined): LaughFader => {
  const [fader, setFader] = useState(initial ?? DEFAULT_LAUGH_FADER);

  // Lu après l'affichage : le rendu serveur n'a pas de `localStorage`.
  useEffect(() => {
    if (initial !== undefined) return;
    const last = getLastLaughFader();
    if (last !== null) setFader(last);
  }, [initial]);

  return {
    fader,
    update: (next) => {
      setFader(next);
      updateLastLaughFader(next);
    },
  };
};
