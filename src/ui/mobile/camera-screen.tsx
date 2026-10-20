import { useCameraScreen } from "./use-camera-screen";
import { useMediaStream } from "./use-media-stream";

// La source navigateur d'OBS qui porte l'image d'une caméra (1920 × 1080) : l'image du téléphone remplit la source. Elle ne joue aucun son
// (muette) : le son du téléphone arrive par la page mic (`CameraMicScreen`), car OBS ne mixe pas le son d'une source cachée. Sans
// téléphone, rien : le fond est transparent.
export const CameraScreen = ({ number }: { number: number }) => {
  const video = useMediaStream<HTMLVideoElement>(useCameraScreen(number, "image"));
  return <video ref={video} className="camera-screen" autoPlay playsInline muted />;
};
