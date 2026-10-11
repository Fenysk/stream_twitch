// Les deux gestes de canvas que l'import et la découpe partagent.

import type { ImageSize } from "../../domain/cut.rules";

export const toCanvas = ({ width, height }: ImageSize): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export const toPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image non encodée"))), "image/png");
  });
