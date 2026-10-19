import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import { ControlKeyButton } from "./control-key";
import type { ControlKey } from "./control-keys";
import { useControlActions } from "./use-control-actions";

type KeyMenuProps = {
  title: string;
  closeLabel: string;
  keys: ControlKey[];
  // Ce que le menu dit à la place des touches quand il n'en a aucune.
  emptyText: string;
  isOpen: boolean;
  onClose: () => void;
  // Un refus (OBS non joint, scène disparue, source introuvable) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

// Un menu du bandeau (les scènes, les micros) : une feuille avec une touche par choix, le choix en cours (l'antenne, le live) clair. Un
// toucher sur un autre fait son geste et referme le menu ; sur le choix en cours, il se referme seulement. Il est sœur du tiroir de la
// régie du Selfie, après lui dans la page, pour passer dessus.
export const KeyMenu = ({ title, closeLabel, keys, emptyText, isOpen, onClose, onToast }: KeyMenuProps) => {
  const press = useControlActions(onToast);
  return (
    <ControlDrawer isOpen={isOpen} label={title} closeLabel={closeLabel} onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">{title}</h2>
      {keys.length === 0 ? (
        <p className="lp-type-body lp-muted control-empty" role="status">
          {emptyText}
        </p>
      ) : (
        <div className="control-menu-list">
          {keys.map((item) => (
            <ControlKeyButton
              key={item.id}
              item={item}
              onPress={(action) => {
                if (item.state !== "active") press(action);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </ControlDrawer>
  );
};
