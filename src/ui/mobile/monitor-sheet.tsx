import { ControlDrawer } from "./control-drawer";
import { MonitorImage } from "./monitor-image";

type MonitorSheetProps = { url: string | null; isLinked: boolean; isOpen: boolean; onClose: () => void };

// Le retour antenne en grand, ouvert par sa vignette (le bandeau de la Régie, l'aperçu du Selfie) : une feuille comme les menus du bandeau,
// sœur du tiroir, après lui dans la page.
export const MonitorSheet = ({ url, isLinked, isOpen, onClose }: MonitorSheetProps) => (
  <ControlDrawer
    isOpen={isOpen}
    label="Retour antenne"
    closeLabel="Fermer le retour antenne"
    onClose={onClose}
  >
    <h2 className="lp-type-heading control-drawer-title">Retour antenne</h2>
    <div className="monitor-large">
      <MonitorImage url={url} isLinked={isLinked} alt="La scène à l'antenne dans OBS" />
    </div>
  </ControlDrawer>
);
