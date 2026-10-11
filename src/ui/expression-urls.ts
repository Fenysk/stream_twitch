import type { ExpressionImagePart, ExpressionRef } from "../domain/head.types";

// L'URL d'une image d'expression : versionnée, pour que le cache d'OBS ne serve jamais l'ancienne image après une retouche.
export const toImageUrl = ({ id, version }: ExpressionRef, part: ExpressionImagePart): string =>
  `/api/expressions/${encodeURIComponent(id)}/image/${part}?v=${encodeURIComponent(version)}`;

export type ImageUrls = { top: string; bottom: string };

export const toImageUrls = (expression: ExpressionRef): ImageUrls => ({
  top: toImageUrl(expression, "top"),
  bottom: toImageUrl(expression, "bottom"),
});

// Une clé par expression et version : deux vues de même clé montrent les mêmes images.
export const toExpressionKey = ({ id, version }: ExpressionRef): string => `${id}@${version}`;
