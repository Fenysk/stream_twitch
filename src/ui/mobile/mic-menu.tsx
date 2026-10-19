import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { toMicKeys, toMicsEmptyText } from "./control-keys";
import { KeyMenu } from "./key-menu";

type MicMenuProps = {
  state: ControlState;
  // Le numéro de la caméra de ce téléphone quand il filme : sa touche dit « · ce téléphone ».
  ownNumber: number | null;
  isOpen: boolean;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// La feuille Micro, ouverte par « Micro : … » de la barre du bas : PC, chaque caméra connectée, puis Muet, le micro entendu clair. Un toucher
// sur un micro l'ouvre dans OBS et coupe tous les autres : un seul micro ouvert, et la tête et Jean-Renard écoutent celui-là. Muet les coupe tous.
export const MicMenu = ({ state, ownNumber, isOpen, onClose, onToast }: MicMenuProps) => (
  <KeyMenu
    title="Micro"
    closeLabel="Fermer le menu des micros"
    keys={toMicKeys(state, ownNumber)}
    emptyText={toMicsEmptyText()}
    isOpen={isOpen}
    onClose={onClose}
    onToast={onToast}
  />
);
