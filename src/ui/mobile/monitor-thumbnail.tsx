import { MonitorImage } from "./monitor-image";

type MonitorThumbnailProps = {
  url: string | null;
  isLinked: boolean;
  // La feuille de l'image en grand est ouverte (aria-expanded).
  isExpanded: boolean;
  onPress: () => void;
};

// La vignette du retour antenne, en tête du bandeau de la Régie ou dans le coin de l'aperçu du Selfie : un bouton qui ouvre l'image en grand
// (MonitorSheet).
export const MonitorThumbnail = ({ url, isLinked, isExpanded, onPress }: MonitorThumbnailProps) => (
  <button
    type="button"
    className="monitor-thumbnail"
    aria-label="Voir le retour antenne en grand"
    aria-expanded={isExpanded}
    onClick={onPress}
  >
    <MonitorImage url={url} isLinked={isLinked} alt="" />
  </button>
);
