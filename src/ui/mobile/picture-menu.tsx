import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { toPictureEmptyText, toPictureKeys } from "./control-keys";
import { KeyMenu } from "./key-menu";

type PictureMenuProps = {
  state: ControlState;
  isOpen: boolean;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Le menu Plan, ouvert par la pastille « Plan : … » : les membres de la place caméra d'OBS (PC, chaque caméra, Tête), celui qui occupe le
// plan clair. Un toucher sur un autre le met seul au plan et lui donne le micro (celui de la caméra choisie, sinon celui du PC) ; une caméra
// dont le téléphone ne filme pas vers OBS est grisée.
export const PictureMenu = ({ state, isOpen, onClose, onToast }: PictureMenuProps) => (
  <KeyMenu
    title="Plan"
    closeLabel="Fermer le menu du plan"
    keys={toPictureKeys(state)}
    emptyText={toPictureEmptyText(state)}
    isOpen={isOpen}
    onClose={onClose}
    onToast={onToast}
  />
);
