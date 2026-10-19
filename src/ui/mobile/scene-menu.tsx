import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { toSceneKeys, toScenesEmptyText } from "./control-keys";
import { KeyMenu } from "./key-menu";

type SceneMenuProps = {
  state: ControlState;
  isOpen: boolean;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Le menu des scènes, ouvert par la pastille de la scène à l'antenne : une touche par scène d'OBS, sauf celles de Master, la scène à
// l'antenne claire. Un toucher sur une autre la passe à l'antenne.
export const SceneMenu = ({ state, isOpen, onClose, onToast }: SceneMenuProps) => (
  <KeyMenu
    title="Scène à l'antenne"
    closeLabel="Fermer le menu des scènes"
    keys={toSceneKeys(state)}
    emptyText={toScenesEmptyText(state)}
    isOpen={isOpen}
    onClose={onClose}
    onToast={onToast}
  />
);
