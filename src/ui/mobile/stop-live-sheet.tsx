import { stopLive } from "../control-api";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import { toSentence } from "./control-keys";

type StopLiveSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  // Un refus d'OBS (non joint, live déjà fini) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// La confirmation de l'arrêt du live, ouverte par la pastille « Live 1:42 » du bandeau : « Arrêter » (danger) envoie StopStream à OBS et
// referme, « Annuler » referme sans rien faire. Une feuille comme les menus du bandeau, sœur du tiroir, après lui dans la page.
export const StopLiveSheet = ({ isOpen, onClose, onToast }: StopLiveSheetProps) => {
  const stop = () => {
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
        OBS arrête la diffusion tout de suite. Elle ne repart pas toute seule.
      </p>
      <div className="control-confirm">
        <Button label="Annuler" variant="ghost" onPress={onClose} />
        <Button label="Arrêter" variant="danger" onPress={stop} />
      </div>
    </ControlDrawer>
  );
};
