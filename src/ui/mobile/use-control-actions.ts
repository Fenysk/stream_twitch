import { useCallback } from "react";
import { updateEnd, updateMic, updatePicture, updateScene } from "../control-api";
import type { ToastTone } from "../design/toast-announcement";
import type { Answer } from "../expressions-api";
import { review } from "../fox-api";
import { playSound } from "../sounds-api";
import { type KeyAction, toSentence } from "./control-keys";

// Le geste d'une touche : la demande au serveur qui lui répond. Le bilan rend ce que Jean-Renard va dire : seul son refus compte ici.
const send = async (action: KeyAction): Promise<Answer<true>> => {
  switch (action.kind) {
    case "scene":
      return updateScene(action.name);
    case "sound":
      return playSound(action.id);
    case "mic":
      return updateMic(action.id);
    case "picture":
      return updatePicture(action.id);
    case "end":
      return updateEnd(action.direction);
    case "review": {
      const answer = await review();
      return answer.ok ? { ok: true, value: true } : answer;
    }
  }
};

// L'appui sur une touche : son geste part au serveur, et un refus (OBS non joint, aucune page /sounds, rien à dire) s'annonce par un
// toast. Un succès ne dit rien : OBS ou l'état de la régie le montrent.
export const useControlActions = (
  show: (tone: ToastTone, text: string) => void,
): ((action: KeyAction) => void) =>
  useCallback(
    (action) => {
      void send(action).then((answer) => {
        if (!answer.ok) show("error", toSentence(answer.message));
      });
    },
    [show],
  );
