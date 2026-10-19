import { useCallback } from "react";
import { toPhonePictureId } from "../../domain/picture.rules";
import { updatePicture } from "../control-api";
import type { ToastTone } from "../design/toast-announcement";
import { toSentence } from "./control-keys";
import type { PhoneLink } from "./use-phone-link";

// Le toucher sur « Hors antenne » d'un téléphone qui filme : il met sa propre caméra à l'image, comme le menu de l'image, et le serveur lui
// donne le micro du live. Un refus (le téléphone ne filme pas vers OBS, la source n'est pas dans la place caméra, OBS non joint) s'annonce par
// le toast de la page ; sinon rien : « À l'antenne » vient du serveur (`PhoneLink.isOnAir`) quand OBS a changé.
export const useTakePicture = (
  { number }: Pick<PhoneLink, "number">,
  show: (tone: ToastTone, text: string) => void,
): (() => void) =>
  useCallback(() => {
    const id = toPhonePictureId(number);
    if (id === null) return;
    void updatePicture(id).then((answer) => {
      if (!answer.ok) show("error", toSentence(answer.message));
    });
  }, [number, show]);
