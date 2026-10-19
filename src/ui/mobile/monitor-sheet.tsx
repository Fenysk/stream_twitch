import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { ControlDrawer } from "./control-drawer";
import {
  type ControlKey,
  toPictureEmptyText,
  toPictureKeys,
  toSceneKeys,
  toScenesEmptyText,
} from "./control-keys";
import { hasPicture } from "./control-view";
import { KeyList } from "./key-list";
import { MonitorImage } from "./monitor-image";
import { useControlActions } from "./use-control-actions";

type MonitorSheetProps = {
  url: string | null;
  state: ControlState;
  isOpen: boolean;
  onClose: () => void;
  // Un refus (OBS non joint, scène disparue) s'annonce par le toast de la page.
  onToast: (tone: ToastTone, text: string) => void;
};

type KeySectionProps = {
  title: string;
  keys: ControlKey[];
  emptyText: string;
  onPress: (item: ControlKey) => void;
};

const KeySection = ({ title, keys, emptyText, onPress }: KeySectionProps) => (
  <section className="control-section">
    <h3 className="lp-type-body lp-muted control-section-title">{title}</h3>
    <KeyList keys={keys} emptyText={emptyText} onPress={onPress} />
  </section>
);

// La feuille Antenne, ouverte par la vignette ou la première ligne du bandeau (Régie et Selfie) : l'image en grand (relue vite tant qu'elle
// est ouverte), puis « Scène » (une touche par scène d'OBS, sauf celles de Master) et « Plan » (PC, caméras, Tête, seulement quand OBS a
// une place caméra). On voit et on change au même endroit : un toucher sur une autre touche fait son geste, la feuille reste ouverte pour
// voir l'antenne changer ; sur la touche claire, il ne fait rien. Sœur du tiroir des sons, après lui dans la page.
export const MonitorSheet = ({ url, state, isOpen, onClose, onToast }: MonitorSheetProps) => {
  const press = useControlActions(onToast);
  const pressKey = (item: ControlKey) => {
    if (item.state !== "active") press(item.action);
  };
  return (
    <ControlDrawer isOpen={isOpen} label="Antenne" closeLabel="Fermer l'antenne" onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">Antenne</h2>
      <div className="monitor-large">
        <MonitorImage url={url} isLinked={state.isLinked} alt="La scène à l'antenne dans OBS" />
      </div>
      <KeySection
        title="Scène"
        keys={toSceneKeys(state)}
        emptyText={toScenesEmptyText(state)}
        onPress={pressKey}
      />
      {hasPicture(state) && (
        <KeySection
          title="Plan"
          keys={toPictureKeys(state)}
          emptyText={toPictureEmptyText(state)}
          onPress={pressKey}
        />
      )}
    </ControlDrawer>
  );
};
