import type { ExpressionRef } from "../domain/head.types";
import { toImageUrls } from "./expression-urls";

// Le décodage ne retient jamais la page : une page cachée (une source OBS hors scène) ne décode pas avant d'être vue.
const DECODE_WAIT_MS = 400;

// Une image prête à être peinte : chargée, puis décodée si le navigateur le fait vite. Un décodage qui échoue ou qui
// traîne après un chargement réussi ne bloque pas.
export const getLoadedImage = (source: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      Promise.race([image.decode(), new Promise((done) => setTimeout(done, DECODE_WAIT_MS))]).then(
        () => resolve(),
        () => resolve(),
      );
    };
    image.onerror = () => reject(new Error(`image introuvable : ${source}`));
    image.src = source;
  });

export const preloadExpression = async (expression: ExpressionRef): Promise<void> => {
  const { top, bottom } = toImageUrls(expression);
  await Promise.all([getLoadedImage(top), getLoadedImage(bottom)]);
};
