import { SkeletonBlock, SkeletonSwap } from "../design/skeleton";

type MonitorImageProps = { url: string | null; isLinked: boolean; alt: string };

// L'image du retour antenne, à la taille de sa place (la vignette, la feuille) : « OBS non joint » sans OBS, le squelette avant la première
// image, puis l'image.
export const MonitorImage = ({ url, isLinked, alt }: MonitorImageProps) => {
  if (!isLinked) return <span className="monitor-empty lp-type-caption lp-muted">OBS non joint</span>;
  return (
    <SkeletonSwap isLoading={url === null} skeleton={<SkeletonBlock shape="area" />}>
      {url !== null && <img className="monitor-image" src={url} alt={alt} />}
    </SkeletonSwap>
  );
};
