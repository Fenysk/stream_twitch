import { stopLive } from "../control-api";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import { toSentence } from "./control-keys";
import { updateStopAskedAt } from "./stop-asked";

type StopLiveSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  // Un refus d'OBS (non joint, live déjà fini) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// La confirmation de l'arrêt du live, ouverte par « Arrêter le live » de la feuille Live (qu'elle remplace) : elle dit le résultat,
// « Arrêter » (danger) envoie StopStream à OBS et referme, « Annuler » referme sans rien faire. L'appui est retenu (`stop-asked.ts`) :
// l'arrêt qui suit n'est pas une alerte. Une feuille comme les autres du bandeau, sœur du tiroir, après lui dans la page.
export const StopLiveSheet = ({ isOpen, onClose, onToast }: StopLiveSheetProps) => {
  const stop = () => {
    updateStopAskedAt(Date.now());
    void stopLive().then((answer) => {
      if (!answer.ok) onToast("error", toSentence(answer.message));
    });
    onClose();
  };
  return (
    <ControlDrawer
      isOpen={isOpen}
      label="Arrêter le live ?"
      closeLabel="Fermer sans arrêter le live"
      onClose={onClose}
    >
      <h2 className="lp-type-heading control-drawer-title">Arrêter le live ?</h2>
      <p className="lp-type-body lp-muted control-confirm-text">
        Le live s'arrête pour tous les viewers, tout de suite. Il ne repart pas tout seul.
      </p>
      <div className="control-confirm">
        <Button label="Annuler" variant="ghost" onPress={onClose} />
        <Button label="Arrêter" variant="danger" onPress={stop} />
      </div>
    </ControlDrawer>
  );
};
