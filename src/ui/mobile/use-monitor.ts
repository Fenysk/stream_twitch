import { useEffect, useState } from "react";
import { MONITOR_SHEET_GAP_MS, MONITOR_THUMBNAIL_GAP_MS, watchMonitor } from "./monitor-feed";

// L'adresse `blob:` de la dernière image de l'antenne, `null` avant la première. Un seul poller sert la vignette et la feuille (`isOpen` :
// elle est ouverte, l'image se redemande plus vite) ; rien n'est demandé tant qu'OBS n'est pas joint.
export const useMonitor = (isLinked: boolean, isOpen: boolean): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  const gapMs = isOpen ? MONITOR_SHEET_GAP_MS : MONITOR_THUMBNAIL_GAP_MS;

  useEffect(() => {
    if (!isLinked) return;
    return watchMonitor(gapMs, setUrl);
  }, [isLinked, gapMs]);

  // L'ancienne adresse se révoque une fois la nouvelle affichée (le nettoyage suit le rendu qui la remplace).
  useEffect(
    () => () => {
      if (url !== null) URL.revokeObjectURL(url);
    },
    [url],
  );

  return url;
};
