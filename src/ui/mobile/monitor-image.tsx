import { SkeletonBlock, SkeletonSwap } from "../design/skeleton";

type MonitorImageProps = { url: string | null; isLinked: boolean; alt: string };

// L'image de l'antenne, à la taille de sa place (la vignette, la feuille) : un fond neutre sans texte sans OBS (seule l'alerte dit « OBS non
// joint »), le squelette avant la première image, puis l'image.
export const MonitorImage = ({ url, isLinked, alt }: MonitorImageProps) => {
  if (!isLinked) return <span className="monitor-empty" aria-hidden="true" />;
  return (
    <SkeletonSwap isLoading={url === null} skeleton={<SkeletonBlock shape="area" />}>
      {url !== null && <img className="monitor-image" src={url} alt={alt} />}
    </SkeletonSwap>
  );
};
