// Les deux moitiés d'une image, dessinées sur canvas à partir de la coupe (domain/cut.rules.ts : les polygones) :
// la moitié haute est tout ce qui est au-dessus de la coupe (1 px de plus), la moitié basse tout ce qui est en dessous,
// avec en option un trait noir (les lèvres) sur son bord haut, tracé seulement là où l'image est opaque.

import { type ImageSize, type Lips, toPartPolygons } from "../../domain/cut.rules";
import type { Cut, Point } from "../../domain/head.types";
import { toCanvas } from "./canvas";

export type PartCanvases = { top: HTMLCanvasElement; bottom: HTMLCanvasElement };

const drawClipped = (
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  polygon: Point[],
): CanvasRenderingContext2D | null => {
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.beginPath();
  for (const [index, { x, y }] of polygon.entries()) {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.save();
  context.clip();
  context.drawImage(source, 0, 0);
  context.restore();
  return context;
};

// `source-atop` : le trait ne se pose que sur les pixels déjà opaques de la moitié basse, il ne déborde pas sur le vide.
const drawLips = (context: CanvasRenderingContext2D, edge: Point[], lips: Lips): void => {
  const [from, to] = edge;
  if (!from || !to) return;
  context.save();
  context.globalCompositeOperation = "source-atop";
  context.strokeStyle = "#000";
  context.lineWidth = lips.thickness;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
};

export const toPartCanvases = (
  source: CanvasImageSource,
  size: ImageSize,
  cut: Cut,
  lips: Lips,
): PartCanvases => {
  const polygons = toPartPolygons(cut, size);
  const top = toCanvas(size);
  const bottom = toCanvas(size);
  drawClipped(top, source, polygons.top);
  const context = drawClipped(bottom, source, polygons.bottom);
  // Le bord haut de la moitié basse : ses deux premiers points.
  if (context && lips.isDrawn) drawLips(context, polygons.bottom.slice(0, 2), lips);
  return { top, bottom };
};
