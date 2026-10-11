// La loupe ×6 sur une charnière : 20 × 20 px de l'image autour de la poignée choisie, en gros pixels, avec ses coordonnées.

import type { ImageSize } from "../../domain/cut.rules";
import type { Point } from "../../domain/head.types";
import type { CssVariables } from "../design/class-names";

const ZOOM = 6;
const LOUPE_PX = 120;

const toDecimal = (value: number): string => value.toFixed(1).replace(".", ",");

type CutLoupeProps = { sourceUrl: string; size: ImageSize; point: Point; label: string };

export const CutLoupe = ({ sourceUrl, size, point, label }: CutLoupeProps) => {
  const style: CssVariables = {
    "--loupe-image": `url("${sourceUrl}")`,
    "--loupe-size": `${size.width * ZOOM}px ${size.height * ZOOM}px`,
    "--loupe-position": `${LOUPE_PX / 2 - point.x * ZOOM}px ${LOUPE_PX / 2 - point.y * ZOOM}px`,
  };
  return (
    <div className="cut-loupe-block">
      <div className="cut-loupe" role="img" aria-label={`Loupe ×${ZOOM} : ${label}`} style={style}>
        <span className="cut-loupe-cross" aria-hidden="true" />
      </div>
      <p className="cut-loupe-position lp-type-caption lp-muted">
        {label} · x {toDecimal(point.x)} · y {toDecimal(point.y)}
      </p>
    </div>
  );
};
