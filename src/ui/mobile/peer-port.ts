// Ce que le téléphone (camera-sender.ts) et la page OBS (camera-receiver.ts) partagent de la mise en relation WebRTC. Les deux
// n'utilisent le navigateur que par un « peer » (peer.ts) : la logique se teste avec un faux.

import type { Signal } from "../../domain/phone.schema";

export type PeerState = RTCPeerConnectionState;

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Les candidats d'une session attendent que son offre ou sa réponse soit partie : l'autre côté ne les accepte qu'après.
export const createSignalGate = (send: (signal: Signal) => void) => {
  const waiting: Signal[] = [];
  let isOpen = false;
  return {
    push(signal: Signal): void {
      if (isOpen) send(signal);
      else waiting.push(signal);
    },
    open(): void {
      isOpen = true;
      for (const signal of waiting.splice(0)) send(signal);
    },
  };
};
