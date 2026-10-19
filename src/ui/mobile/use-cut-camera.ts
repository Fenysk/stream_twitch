import { useCallback } from "react";
import { toCutRequest } from "../../domain/picture.rules";
import { updatePicture } from "../control-api";
import type { ToastTone } from "../design/toast-announcement";
import { toSentence } from "./control-keys";
import type { PhoneLink } from "./use-phone-link";

// Le bouton qui coupe ou montre la caméra d'un téléphone. Hors de l'image, un toucher y met ce téléphone et lui donne le micro du live. À
// l'image, un toucher passe l'image à la tête et garde le micro à ce téléphone : la tête bouge avec sa voix. Le téléphone continue d'envoyer
// son image, le retour est instantané. Un refus (le téléphone ne filme pas vers OBS, pas de place caméra, OBS non joint) s'annonce par le
// toast de la page ; sinon rien : `PhoneLink.standing` vient du serveur quand OBS a changé.
export const useCutCamera = (
  { standing, number }: Pick<PhoneLink, "standing" | "number">,
  show: (tone: ToastTone, text: string) => void,
): (() => void) =>
  useCallback(() => {
    const request = toCutRequest(standing, number);
    if (request === null) return;
    void updatePicture(request.id, request.isMicKept).then((answer) => {
      if (!answer.ok) show("error", toSentence(answer.message));
    });
  }, [standing, number, show]);
