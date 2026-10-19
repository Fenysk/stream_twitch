import { MicOff } from "lucide-react";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import { type ControlKey, toMicKeys, toMicsEmptyText, toMuteKey } from "./control-keys";
import { KeyList } from "./key-list";
import { useControlActions } from "./use-control-actions";

type MicMenuProps = {
  state: ControlState;
  // Le numéro de la caméra de ce téléphone quand il filme : sa touche dit « · ce téléphone ».
  ownNumber: number | null;
  isOpen: boolean;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// La feuille Micro, ouverte par « Micro : … » de la barre du bas : sous « Micro entendu », PC puis chaque caméra connectée, le micro entendu
// clair ; sous un filet, « Couper le micro » à part (« Micro coupé » enfoncé quand tout est coupé, la liste n'a alors aucun micro clair). Un
// toucher sur un micro l'ouvre dans OBS et coupe tous les autres : un seul micro ouvert, et la tête et Jean-Renard écoutent celui-là.
// « Couper le micro » les coupe tous.
export const MicMenu = ({ state, ownNumber, isOpen, onClose, onToast }: MicMenuProps) => {
  const press = useControlActions(onToast);
  const choose = (item: ControlKey) => {
    if (item.state !== "active") press(item.action);
    onClose();
  };
  const mute = toMuteKey(state);
  return (
    <ControlDrawer isOpen={isOpen} label="Micro" closeLabel="Fermer le menu des micros" onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">Micro</h2>
      <section className="control-mics">
        <h3 className="lp-type-body lp-muted control-section-title">Micro entendu</h3>
        <KeyList keys={toMicKeys(state, ownNumber)} emptyText={toMicsEmptyText()} onPress={choose} />
      </section>
      {state.mics.length > 0 && (
        <div className="control-mute">
          <Button
            icon={MicOff}
            label={mute.label}
            isPressed={mute.state === "active"}
            onPress={() => choose(mute)}
          />
        </div>
      )}
    </ControlDrawer>
  );
};
