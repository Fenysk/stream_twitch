// L'aperçu en direct de l'onglet « Renard » : le même composant Fox que la page `/fox`, nourri par le même flux (les règles
// appliquées, et le WAV quand il parle), sur un damier. Il bouge à chaque curseur ; il dit les phrases de « Faire parler »,
// sauf si une page `/fox` est connectée (OBS) : alors il anime la bouche sans faire de son. Il s'en va comme dans OBS : le
// cadre le coupe quand il glisse vers le bas.

import type { RefObject } from "react";
import type { FoxImage } from "../../domain/fox.schema";
import { Fox } from "../Fox";

type FoxPreviewProps = { image: FoxImage | null; bodyRef: RefObject<HTMLDivElement | null> };

export const FoxPreview = ({ image, bodyRef }: FoxPreviewProps) => (
  <div
    className="head-preview-stage settings-checker fox-preview-stage"
    role="img"
    aria-label="Aperçu du renard"
  >
    {image && <Fox image={image} bodyRef={bodyRef} layout="box" />}
  </div>
);
