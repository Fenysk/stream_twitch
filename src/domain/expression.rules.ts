import type { ExpressionIssue } from "./expression.schema";
import type { HeadFile } from "./head.schema";
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, toPngSize } from "./png.rules";

export type ExpressionImageBytes = { source?: Uint8Array; top: Uint8Array; bottom: Uint8Array };

type ImagePart = keyof ExpressionImageBytes;

// Une image reçue : un PNG, pas trop lourd ni trop grand, de la taille de l'image d'origine de la géométrie.
const toImageIssue = (bytes: Uint8Array, geometry: HeadFile): string | undefined => {
  if (bytes.length > MAX_IMAGE_BYTES) return "image trop lourde, 4 Mo au plus";
  const size = toPngSize(bytes);
  if (!size) return "ce n'est pas une image PNG";
  if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) return "2000 px de côté au plus";
  const { largeur, hauteur } = geometry.image;
  if (size.width !== largeur || size.height !== hauteur) {
    return `doit faire ${largeur} × ${hauteur} px, comme l'image d'origine`;
  }
  return undefined;
};

const isInside = (point: { x: number; y: number }, { largeur, hauteur }: HeadFile["image"]): boolean =>
  point.x >= 0 && point.x <= largeur && point.y >= 0 && point.y <= hauteur;

// Ce que le serveur refuse d'une expression avant de rien écrire : les images, puis la géométrie dans l'image.
export function toExpressionIssues(geometry: HeadFile, images: ExpressionImageBytes): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  for (const part of ["source", "top", "bottom"] as const satisfies readonly ImagePart[]) {
    const bytes = images[part];
    const message = bytes && toImageIssue(bytes, geometry);
    if (message) issues.push({ path: part, message });
  }
  const { gauche, droite } = geometry.coupe;
  if (!isInside(gauche, geometry.image) || !isInside(droite, geometry.image)) {
    issues.push({ path: "geometry.coupe", message: "les deux charnières doivent être dans l'image" });
  }
  if ((geometry.fermeture ?? 0) > geometry.image.hauteur) {
    issues.push({ path: "geometry.fermeture", message: "ne peut pas dépasser la hauteur de l'image" });
  }
  return issues;
}
