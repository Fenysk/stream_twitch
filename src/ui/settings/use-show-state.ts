import { useEffect, useState } from "react";
import { IDLE_SHOW, type ShowState } from "../../domain/show.schema";
import { watchShowState } from "../show-api";

// L'état de l'émission pour l'onglet : arrêtée tant que le serveur n'a pas dit autre chose (il le dit dès la connexion).
export const useShowState = (): ShowState => {
  const [state, setState] = useState<ShowState>(IDLE_SHOW);
  useEffect(() => watchShowState(false, setState), []);
  return state;
};
