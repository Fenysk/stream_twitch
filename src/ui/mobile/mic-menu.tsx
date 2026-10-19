import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { toMicKeys, toMicsEmptyText } from "./control-keys";
import { KeyMenu } from "./key-menu";

type MicMenuProps = {
  state: ControlState;
  isOpen: boolean;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Le menu des micros, ouvert par la pastille « Micro : … » : le micro du PC et celui de chaque caméra connectée, celui du live clair. Un
// toucher sur un autre l'ouvre dans OBS et coupe tous les autres : un seul micro ouvert, et la tête et Jean-Renard écoutent celui-là.
export const MicMenu = ({ state, isOpen, onClose, onToast }: MicMenuProps) => (
  <KeyMenu
    title="Micro du live"
    closeLabel="Fermer le menu des micros"
    keys={toMicKeys(state)}
    emptyText={toMicsEmptyText()}
    isOpen={isOpen}
    onClose={onClose}
    onToast={onToast}
  />
);
