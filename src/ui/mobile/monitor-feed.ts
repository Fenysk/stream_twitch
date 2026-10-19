// Le retour antenne côté téléphone : une requête courte par image, jamais un flux (la régie en tient déjà deux).

import { getMonitorImage } from "../control-api";
import { getLoadedImage } from "../preload-images";

// Le délai entre deux images : la vignette du bandeau, la feuille ouverte (plus fluide).
export const MONITOR_THUMBNAIL_GAP_MS = 1000;
export const MONITOR_SHEET_GAP_MS = 250;
// Une requête sans réponse (coupure du réseau) est abandonnée à ce délai : sans lui, la vignette resterait figée.
const REQUEST_LIMIT_MS = 5000;

// Une adresse `blob:` d'image prête à peindre, ou `null` (demande en échec ou abandonnée, image indécodable).
const getImageUrl = async (request: AbortController): Promise<string | null> => {
  const limit = setTimeout(() => request.abort(), REQUEST_LIMIT_MS);
  const blob = await getMonitorImage(request.signal);
  clearTimeout(limit);
  if (blob === null) return null;
  const url = URL.createObjectURL(blob);
  try {
    await getLoadedImage(url);
    return url;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
};

// La suivante part `gapMs` après que la précédente a été montrée ou a échoué : jamais deux en vol, rien page cachée (elle repart au retour).
// L'adresse donnée à `onImage` est à l'appelant, qui la révoque une fois remplacée.
export const watchMonitor = (gapMs: number, onImage: (url: string) => void): (() => void) => {
  let current: AbortController | null = null;
  let isRequesting = false;
  let isStopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const next = async (): Promise<void> => {
    if (isStopped || isRequesting || document.visibilityState === "hidden") return;
    isRequesting = true;
    const request = new AbortController();
    current = request;
    const url = await getImageUrl(request);
    current = null;
    isRequesting = false;
    if (url !== null) {
      if (isStopped) URL.revokeObjectURL(url);
      else onImage(url);
    }
    if (!isStopped) timer = setTimeout(() => void next(), gapMs);
  };

  const onVisibilityChange = () => {
    clearTimeout(timer);
    void next();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  void next();

  return () => {
    isStopped = true;
    current?.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};
