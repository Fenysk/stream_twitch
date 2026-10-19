import { Eye } from "lucide-react";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import { ControlKeyButton } from "./control-key";
import { toFoxKeys } from "./control-keys";
import { toEndText, toViewersLineText, toViewersText } from "./control-view";
import { useControlActions } from "./use-control-actions";

type LiveSheetProps = {
  state: ControlState;
  isOpen: boolean;
  onClose: () => void;
  // La liste des présents et la confirmation de l'arrêt sont d'autres feuilles : celle-ci leur laisse la place.
  onOpenViewers: () => void;
  onOpenStop: () => void;
  // Un refus (OBS non joint, rien à dire) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// La feuille Live, ouverte par la deuxième ligne du bandeau (Régie et Selfie) : « Fin prévue 23:40 » avec −10 min et +10 min, « Bilan »,
// la ligne des viewers qui ouvre la liste des présents et, pendant le live seulement, « Arrêter le live » en rouge, qui ouvre sa
// confirmation. Une touche de fin reste dans la feuille pour voir l'heure changer ; le bilan et la fin du live referment tout. Sœur du
// tiroir des sons, après lui dans la page.
export const LiveSheet = ({ state, isOpen, onClose, onOpenViewers, onOpenStop, onToast }: LiveSheetProps) => {
  const press = useControlActions(onToast);
  return (
    <ControlDrawer isOpen={isOpen} label="Live" closeLabel="Fermer le live" onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">Live</h2>
      <div className="control-live-keys">
        <p className="lp-type-body control-live-end">{toEndText(state)}</p>
        {toFoxKeys().map((item) => (
          <ControlKeyButton
            key={item.id}
            item={item}
            onPress={(action) => {
              press(action);
              if (action.kind === "review") onClose();
            }}
          />
        ))}
      </div>
      <Button
        icon={Eye}
        label={toViewersLineText(state.viewers)}
        title={`${toViewersText(state.viewers).title} : voir qui est dans le tchat`}
        onPress={onOpenViewers}
      />
      {state.broadcast.isLive && <Button label="Arrêter le live" variant="danger" onPress={onOpenStop} />}
    </ControlDrawer>
  );
};
