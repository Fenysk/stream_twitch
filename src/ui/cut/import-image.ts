// L'import d'une image dans l'onglet « Découpe » : un fichier devient un PNG d'au plus 1600 px et 4 Mo, avec son opacité
// (pour deviner la coupe). Un fichier qui n'est pas une image est refusé avec une phrase.

import { type AlphaImage, type ImageSize, toDownscaledSize } from "../../domain/cut.rules";
import { MAX_IMAGE_BYTES } from "../../domain/png.rules";
import { toCanvas, toPngBlob } from "./canvas";

// L'image importée tient dans ce côté : de quoi découper sans alourdir l'enregistrement.
const IMPORT_MAX_SIDE = 1600;
// Un PNG trop lourd est réduit de ce facteur, jusqu'à tenir dans la limite du serveur.
const SHRINK_FACTOR = 0.8;
const SHRINK_TRIES = 8;

export type ImportedImage = { blob: Blob; size: ImageSize; alpha: AlphaImage };
export type ImportAnswer = { ok: true; image: ImportedImage } | { ok: false; message: string };

// L'opacité d'un canvas : le canal alpha de chaque pixel.
const toAlpha = (canvas: HTMLCanvasElement): AlphaImage => {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d")?.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  if (pixels) for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3] ?? 0;
  return { width, height, alpha };
};

export const getImportedImage = async (file: File): Promise<ImportAnswer> => {
  if (!file.type.startsWith("image/")) return { ok: false, message: "ce fichier n'est pas une image" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "image illisible" };
  }
  let size = toDownscaledSize({ width: bitmap.width, height: bitmap.height }, IMPORT_MAX_SIDE);
  for (let attempt = 0; attempt < SHRINK_TRIES; attempt += 1) {
    const canvas = toCanvas(size);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await toPngBlob(canvas).catch(() => null);
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      bitmap.close();
      return { ok: true, image: { blob, size, alpha: toAlpha(canvas) } };
    }
    size = toDownscaledSize(size, Math.floor(Math.max(size.width, size.height) * SHRINK_FACTOR));
  }
  bitmap.close();
  return { ok: false, message: "image trop lourde, même réduite" };
};
