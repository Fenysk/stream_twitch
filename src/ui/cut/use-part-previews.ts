// Les deux moitiés de l'image en cours de découpe, prêtes à être montrées par l'aperçu : redessinées peu après le
// dernier geste, et seulement une fois chargées (l'aperçu garde les anciennes jusque-là, sans clignoter).

import { useEffect, useState } from "react";
import type { ImageSize, Lips } from "../../domain/cut.rules";
import type { Cut } from "../../domain/head.types";
import type { ImageUrls } from "../expression-urls";
import { getLoadedImage } from "../preload-images";
import { toPartCanvases } from "./build-parts";
import { toPngBlob } from "./canvas";

const REDRAW_DELAY_MS = 90;

export const usePartPreviews = (
  image: HTMLImageElement | null,
  size: ImageSize | undefined,
  cut: Cut | undefined,
  lips: Lips | undefined,
): ImageUrls | null => {
  const [urls, setUrls] = useState<ImageUrls | null>(null);

  useEffect(() => {
    if (!image || !size || !cut || !lips) {
      setUrls(null);
      return;
    }
    let isCurrent = true;
    const timer = setTimeout(async () => {
      try {
        const parts = toPartCanvases(image, size, cut, lips);
        const [top, bottom] = await Promise.all([toPngBlob(parts.top), toPngBlob(parts.bottom)]);
        const next = { top: URL.createObjectURL(top), bottom: URL.createObjectURL(bottom) };
        await Promise.all([getLoadedImage(next.top), getLoadedImage(next.bottom)]);
        if (isCurrent) setUrls(next);
      } catch (error) {
        console.error("Découpe : aperçu non dessiné", error);
      }
    }, REDRAW_DELAY_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [image, size, cut, lips]);

  return urls;
};
