import { ControlDrawer } from "./control-drawer";
import { MonitorImage } from "./monitor-image";

type MonitorSheetProps = { url: string | null; isLinked: boolean; isOpen: boolean; onClose: () => void };

// L'antenne en grand, ouverte par sa vignette (en tête du bandeau de la Régie et du Selfie) : une feuille comme les menus du bandeau,
// sœur du tiroir, après lui dans la page.
export const MonitorSheet = ({ url, isLinked, isOpen, onClose }: MonitorSheetProps) => (
  <ControlDrawer isOpen={isOpen} label="Antenne" closeLabel="Fermer l'antenne" onClose={onClose}>
    <h2 className="lp-type-heading control-drawer-title">Antenne</h2>
    <div className="monitor-large">
      <MonitorImage url={url} isLinked={isLinked} alt="La scène à l'antenne dans OBS" />
    </div>
  </ControlDrawer>
);
