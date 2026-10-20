import { classNames } from "../design/class-names";
import { useMediaStream } from "./use-media-stream";

type CameraPreviewProps = {
  stream: MediaStream | null;
  // Le miroir de l'aperçu seul (la caméra avant du Selfie) : l'image envoyée à OBS n'est pas touchée.
  isMirrored?: boolean;
};

// L'aperçu de ce que la caméra filme, en entier (sans recadrage). Muet : le mic du téléphone est dans OBS, pas dans le haut-parleur.
export const CameraPreview = ({ stream, isMirrored = false }: CameraPreviewProps) => {
  const video = useMediaStream<HTMLVideoElement>(stream);
  return (
    <video
      ref={video}
      className={classNames("camera-preview", isMirrored && "is-mirrored")}
      autoPlay
      playsInline
      muted
    />
  );
};
