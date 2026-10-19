// Les téléphones connectés et l'origine d'où ils ouvrent /mobile, en direct : le serveur les envoie à la connexion puis à chaque
// changement (un téléphone arrive ou part, une page OBS s'ouvre, un numéro change).

import { useEffect, useState } from "react";
import type { MobileState } from "../../domain/phone.schema";
import { watchMobileState } from "../mobile-api";

// `null` tant que le serveur n'a pas répondu.
export const useMobileState = (): MobileState | null => {
  const [state, setState] = useState<MobileState | null>(null);
  useEffect(() => watchMobileState(setState), []);
  return state;
};
