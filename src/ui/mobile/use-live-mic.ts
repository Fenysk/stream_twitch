import { useCallback } from "react";
import { toMicToggle } from "../../domain/control.rules";
import { updateMic } from "../control-api";
import type { ToastTone } from "../design/toast-announcement";
import { toSentence } from "./control-keys";
import type { PhoneLink } from "./use-phone-link";

// Le bouton micro d'un téléphone qui filme : le geste du menu des micros, pour ce téléphone. Allumé (il est le micro du live), un toucher rend
// le live au micro du PC ; éteint, il le prend : OBS ouvre l'entrée de sa source et coupe les autres. La piste audio du téléphone n'est
// jamais coupée ici : elle part toujours vers OBS, c'est la coupure d'OBS qui décide. Un refus (source OBS introuvable, OBS non joint)
// s'annonce par le toast de la page ; sinon rien : le serveur redit l'état (`PhoneLink.isLiveMic`) quand OBS l'a changé.
export const useLiveMic = (
  { isLiveMic, number }: Pick<PhoneLink, "isLiveMic" | "number">,
  show: (tone: ToastTone, text: string) => void,
): (() => void) =>
  useCallback(() => {
    const id = toMicToggle(isLiveMic, number);
    if (id === null) return;
    void updateMic(id).then((answer) => {
      if (!answer.ok) show("error", toSentence(answer.message));
    });
  }, [isLiveMic, number, show]);
