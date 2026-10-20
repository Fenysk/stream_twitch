import { useCameraScreen } from "./use-camera-screen";
import { useMediaStream } from "./use-media-stream";

// La source navigateur d'OBS qui ne porte que le son d'une caméra : vide et transparente, elle joue la piste audio du téléphone.
// « Contrôler l'audio via OBS » y est cochée, et la source vit dans une scène présente partout (« Master - Micros ») : le mic s'entend dans
// toutes les scènes, que la caméra soit visible ou cachée. Une piste audio n'a pas de sous-titres : la piste est vide.
export const CameraMicScreen = ({ number }: { number: number }) => {
  const audio = useMediaStream<HTMLAudioElement>(useCameraScreen(number, "mic"));
  return (
    <audio ref={audio} autoPlay>
      <track kind="captions" />
    </audio>
  );
};
