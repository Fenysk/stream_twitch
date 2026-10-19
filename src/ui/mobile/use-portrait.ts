import { useSyncExternalStore } from "react";

const PORTRAIT_QUERY = "(orientation: portrait)";

const subscribe = (listener: () => void): (() => void) => {
  const media = window.matchMedia(PORTRAIT_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

// Le téléphone est tenu en hauteur. Le serveur ne le sait pas : il rend « non », et la page relit au premier rendu du navigateur.
export const usePortrait = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PORTRAIT_QUERY).matches,
    () => false,
  );
