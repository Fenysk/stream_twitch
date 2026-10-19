// L'état de la régie, tel que le serveur le dit dans le flux du téléphone (évènement `control`) : à la connexion puis à chaque
// changement. Le téléphone n'ouvre pas de flux de plus : c'est celui qui l'annonce au serveur comme téléphone Régie.

import { useEffect, useState } from "react";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import type { PhoneRole } from "../../domain/phone.schema";
import { watchPhone } from "../mobile-api";
import { getPhoneId } from "./mobile-storage";

// `receivedAt` : l'instant (horloge du téléphone) où l'état est arrivé, de quoi faire avancer la durée du live entre deux états.
// `staleAt` : l'instant où le flux est devenu périmé (rien reçu depuis 15 s, ou une erreur), absent ou `null` tant qu'il est vivant : la durée
// du live cesse alors d'avancer, et le bandeau se grise.
export type ControlView = { state: ControlState; receivedAt: number; staleAt?: number | null };

// Ce que la page voit tant que le serveur n'a rien dit.
export const IDLE_VIEW: ControlView = { state: IDLE_CONTROL, receivedAt: 0 };

// La vue quand le flux devient périmé ou redevient vivant : l'état, lui, ne change pas.
export const toStaleView = (view: ControlView, isStale: boolean, now: number): ControlView => ({
  ...view,
  staleAt: isStale ? now : null,
});

export const useControlState = (role: PhoneRole): ControlView => {
  const [view, setView] = useState<ControlView>(IDLE_VIEW);

  useEffect(
    () =>
      watchPhone({
        id: getPhoneId(),
        role,
        // Une régie n'a pas de caméra : le serveur ne lui donne pas de numéro.
        getNumber: () => null,
        onOpen: () => undefined,
        onStale: (isStale) => setView((previous) => toStaleView(previous, isStale, Date.now())),
        onEvent: (event) => {
          if (event.kind === "control")
            setView({ state: event.state, receivedAt: Date.now(), staleAt: null });
        },
      }),
    [role],
  );

  return view;
};
