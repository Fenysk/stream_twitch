// La liste des clips bruts côté page : lue à l'ouverture de l'onglet, relue après chaque action ou à la demande. Valider et jeter
// passent par ici : un clip à la fois, la liste se relit ensuite.

import { useCallback, useEffect, useState } from "react";
import type { ClipList, ConfirmRequest } from "../../domain/clip.schema";
import { confirmClip, discardClip, listClips, reviseClip, withdrawClip } from "../clips-api";

export type UseClips = {
  // `null` tant que le serveur n'a pas répondu.
  list: ClipList | null;
  // Le refus à montrer (dossier introuvable, serveur muet), `null` quand la dernière liste est arrivée.
  error: string | null;
  // Un clip est en cours de recodage ou de rangement : rien d'autre ne démarre.
  isWorking: boolean;
  refresh: () => Promise<void>;
  // Rendent le refus du serveur à montrer, ou `null` quand le clip est rangé (la liste est relue).
  confirm: (request: ConfirmRequest) => Promise<string | null>;
  discard: (name: string) => Promise<string | null>;
  // Pour un clip confirmé : enregistrer ses changements (titre, phrases, début, fin), ou le retirer de l'émission.
  revise: (request: ConfirmRequest) => Promise<string | null>;
  withdraw: (name: string) => Promise<string | null>;
};

export const useClips = (): UseClips => {
  const [list, setList] = useState<ClipList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const refresh = useCallback(async () => {
    const answer = await listClips();
    if (answer.ok) {
      setList(answer.value);
      setError(null);
    } else setError(answer.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const work = useCallback(
    async (task: () => ReturnType<typeof discardClip>): Promise<string | null> => {
      setIsWorking(true);
      const answer = await task();
      if (answer.ok) await refresh();
      setIsWorking(false);
      return answer.ok ? null : answer.message;
    },
    [refresh],
  );

  const confirm = useCallback((request: ConfirmRequest) => work(() => confirmClip(request)), [work]);
  const discard = useCallback((name: string) => work(() => discardClip(name)), [work]);
  const revise = useCallback((request: ConfirmRequest) => work(() => reviseClip(request)), [work]);
  const withdraw = useCallback((name: string) => work(() => withdrawClip(name)), [work]);

  return { list, error, isWorking, refresh, confirm, discard, revise, withdraw };
};
