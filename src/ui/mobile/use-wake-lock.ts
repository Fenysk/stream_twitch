// L'écran du téléphone ne se met pas en veille tant que la caméra tourne (Screen Wake Lock). Le navigateur relâche le verrou quand la
// page passe en arrière-plan : il est redemandé au retour.

import { useEffect } from "react";

export const useWakeLock = (): void => {
  useEffect(() => {
    if (!("wakeLock" in navigator)) {
      console.warn("Caméra : ce navigateur ne peut pas garder l'écran allumé");
      return;
    }
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        await lock?.release();
        lock = await navigator.wakeLock.request("screen");
      } catch (error) {
        console.warn("Caméra : l'écran pourra se mettre en veille", error);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);
};
