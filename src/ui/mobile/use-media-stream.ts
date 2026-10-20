import { type RefObject, useEffect, useRef } from "react";

// Joue un flux dans un `<video>` ou un `<audio>`. Un navigateur qui refuse de lancer la lecture avec son (pas d'autorisation d'autoplay) la
// lance sans le son plutôt que de ne rien montrer : OBS autorise l'autoplay, un onglet ordinaire non.
export const useMediaStream = <Media extends HTMLMediaElement>(
  stream: MediaStream | null,
): RefObject<Media | null> => {
  const media = useRef<Media>(null);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    // Un flux qui reçoit sa deuxième piste ne relance pas la lecture.
    if (element.srcObject !== stream) element.srcObject = stream;
    if (!stream) return;
    element.play().catch((error: unknown) => {
      console.warn("Caméra : lecture avec le son refusée, nouvel essai sans le son", error);
      element.muted = true;
      element.play().catch((retry: unknown) => console.warn("Caméra : la lecture a échoué", retry));
    });
  }, [stream]);
  return media;
};
