import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import type { ControlKey } from "./control-keys";
import { KeyList } from "./key-list";
import { useControlActions } from "./use-control-actions";

type KeyMenuProps = {
  title: string;
  closeLabel: string;
  keys: ControlKey[];
  // Ce que le menu dit à la place des touches quand il n'en a aucune.
  emptyText: string;
  isOpen: boolean;
  onClose: () => void;
  // Un refus (OBS non joint, source introuvable) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// Un menu de la barre du bas (les micros) : une feuille avec une touche par choix, le choix en cours (le micro entendu) clair. Un toucher sur
// un autre fait son geste et referme le menu ; sur le choix en cours, il se referme seulement. Il est sœur du tiroir des sons, après lui
// dans la page, pour passer dessus.
export const KeyMenu = ({ title, closeLabel, keys, emptyText, isOpen, onClose, onToast }: KeyMenuProps) => {
  const press = useControlActions(onToast);
  return (
    <ControlDrawer isOpen={isOpen} label={title} closeLabel={closeLabel} onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">{title}</h2>
      <KeyList
        keys={keys}
        emptyText={emptyText}
        onPress={(item) => {
          if (item.state !== "active") press(item.action);
          onClose();
        }}
      />
    </ControlDrawer>
  );
};
