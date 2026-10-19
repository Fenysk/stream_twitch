import { type RefObject, useEffect, useRef } from "react";

// Montre un flux dans un `<video>`. Un navigateur qui refuse de lancer l'image avec son (pas d'autorisation d'autoplay) la lance sans
// le son plutôt que de ne rien montrer : OBS autorise l'autoplay, un onglet ordinaire non.
export const useVideoStream = (stream: MediaStream | null): RefObject<HTMLVideoElement | null> => {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Un flux qui reçoit sa deuxième piste (le son après l'image) ne relance pas la lecture.
    if (element.srcObject !== stream) element.srcObject = stream;
    if (!stream) return;
    element.play().catch((error: unknown) => {
      console.warn("Caméra : lecture avec le son refusée, l'image passe sans le son", error);
      element.muted = true;
      element.play().catch((retry: unknown) => console.warn("Caméra : la lecture a échoué", retry));
    });
  }, [stream]);
  return video;
};
