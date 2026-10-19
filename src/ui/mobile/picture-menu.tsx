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

// Le menu de l'image, ouvert par la pastille « Image : … » : les membres de la place caméra d'OBS (PC, chaque caméra, Tête), celui qui est à
// l'image clair. Un toucher sur un autre le met seul à l'image et lui donne le micro du live (celui de la caméra choisie, sinon celui du PC) ;
// une caméra dont le téléphone ne filme pas vers OBS est grisée.
export const PictureMenu = ({ state, isOpen, onClose, onToast }: PictureMenuProps) => (
  <KeyMenu
    title="Qui est à l'image"
    closeLabel="Fermer le menu de l'image"
    keys={toPictureKeys(state)}
    emptyText={toPictureEmptyText(state)}
    isOpen={isOpen}
    onClose={onClose}
    onToast={onToast}
  />
);
