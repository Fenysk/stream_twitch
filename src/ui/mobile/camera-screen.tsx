import { useCameraScreen } from "./use-camera-screen";
import { useVideoStream } from "./use-video-stream";

// La source navigateur d'OBS d'une caméra (1920 × 1080) : l'image du téléphone remplit la source, avec son son (OBS le capte avec
// « Contrôler l'audio via OBS »). Sans téléphone, rien : le fond est transparent. Une caméra n'a pas de sous-titres : la piste est vide.
export const CameraScreen = ({ number }: { number: number }) => {
  const video = useVideoStream(useCameraScreen(number));
  return (
    <video ref={video} className="camera-screen" autoPlay playsInline>
      <track kind="captions" />
    </video>
  );
};
