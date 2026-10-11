// Les règles de l'onglet « Découpe » : où couper une image en deux moitiés, comment déplacer la coupe, et la géométrie
// que le serveur enregistre. Tout est calculé en pixels de l'image, sans canvas ni React : l'interface dessine, ces
// fonctions décident.

import type { HeadFile } from "./head.schema";
import type { Cut, Point } from "./head.types";

export type ImageSize = { width: number; height: number };

// L'opacité d'une image : un octet (le canal alpha) par pixel, ligne après ligne.
export type AlphaImage = ImageSize & { alpha: ArrayLike<number> };

// Le trait noir de la bouche, tracé sur le bord haut de la moitié basse.
export type Lips = { isDrawn: boolean; thickness: number };

export type CutSuggestion = { cut: Cut; lips: Lips; closing: number; isGapFound: boolean };

// Ce que l'onglet retouche : le nom d'une expression, sa coupe, ses lèvres et son closing.
export type EditableCut = { name: string; cut: Cut; lips: Lips; closing: number };

// Sous ce niveau d'opacité (0 à 255), un pixel compte pour transparent : le lissage des bords ne bouche pas une bande.
const OPAQUE_FROM = 16;
// La bande de la bouche tient dans cette part de la hauteur du personnage (0 en haut, 1 en bas).
const GAP_FROM = 0.3;
const GAP_TO = 0.85;
// Les lignes, de chaque côté de la bande, qui donnent les bords du personnage.
const EDGE_ROWS = 4;
// Sans bande, la coupe passe à cette part de la hauteur de l'image.
const GUESS_AT = 0.7;
const DEFAULT_THICKNESS = 10;
// Le closing proposé dépasse la bande de 2 px : la moitié haute mord un peu sur la mâchoire, plutôt que de la frôler.
const CLOSING_OVERLAP = 2;
// Deux charnières restent au moins à cet écart l'une de l'autre : la coupe garde un sens.
const MIN_HINGE_GAP = 1;

const round1 = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

type Extent = { first: number; last: number };

// De la première à la dernière colonne opaque d'une ligne ; rien si la ligne est transparente.
const toRowExtent = ({ width, alpha }: AlphaImage, y: number): Extent | undefined => {
  let first: number | undefined;
  let last = 0;
  for (let x = 0; x < width; x += 1) {
    if ((alpha[y * width + x] ?? 0) < OPAQUE_FROM) continue;
    first ??= x;
    last = x;
  }
  return first === undefined ? undefined : { first, last };
};

// Une bande de lignes transparentes entre deux lignes opaques (bornes comprises).
type Band = { start: number; end: number };

const toBands = (extents: (Extent | undefined)[], firstRow: number, lastRow: number): Band[] => {
  const bands: Band[] = [];
  let start: number | undefined;
  for (let y = firstRow + 1; y < lastRow; y += 1) {
    if (!extents[y]) start ??= y;
    else if (start !== undefined) {
      bands.push({ start, end: y - 1 });
      start = undefined;
    }
  }
  if (start !== undefined) bands.push({ start, end: lastRow - 1 });
  return bands;
};

const toBandHeight = ({ start, end }: Band): number => end - start + 1;

// La bande de la bouche : la plus haute de celles qui tiennent entre 30 % et 85 % du personnage, la plus proche du milieu
// à hauteur égale.
const toMouthBand = (bands: Band[], firstRow: number, lastRow: number): Band | undefined => {
  const span = lastRow + 1 - firstRow;
  const position = (band: Band): number => ((band.start + band.end + 1) / 2 - firstRow) / span;
  return bands
    .filter((band) => position(band) >= GAP_FROM && position(band) <= GAP_TO)
    .sort(
      (a, b) =>
        toBandHeight(b) - toBandHeight(a) || Math.abs(position(a) - 0.5) - Math.abs(position(b) - 0.5),
    )[0];
};

// Les bords du personnage de chaque côté de la bande : le plus large des deux.
const toBandEdges = (extents: (Extent | undefined)[], band: Band, firstRow: number, lastRow: number) => {
  const rows = [
    ...Array.from({ length: EDGE_ROWS }, (_, index) => band.start - 1 - index),
    ...Array.from({ length: EDGE_ROWS }, (_, index) => band.end + 1 + index),
  ].filter((y) => y >= firstRow && y <= lastRow);
  const found = rows.flatMap((y) => extents[y] ?? []);
  return {
    left: Math.min(...found.map(({ first }) => first)),
    right: Math.max(...found.map(({ last }) => last)) + 1,
  };
};

// Sans bande : la coupe à 70 % de la hauteur, charnières sur les bords opaques de cette ligne (ceux de l'image si elle est vide).
const toGuessedCut = (image: AlphaImage): CutSuggestion => {
  const y = round1(image.height * GUESS_AT);
  const extent = toRowExtent(image, Math.min(image.height - 1, Math.floor(y)));
  return {
    cut: {
      left: { x: extent ? extent.first : 0, y },
      right: { x: extent ? extent.last + 1 : image.width, y },
    },
    lips: { isDrawn: true, thickness: DEFAULT_THICKNESS },
    closing: 0,
    isGapFound: false,
  };
};

// Où couper une image qu'on vient d'importer. Une bande transparente entre le haut et le bas (une image déjà découpée) donne
// la coupe en son milieu, des charnières sur les bords du personnage, le closing de sa hauteur plus 2 px et pas de lèvres. Sinon,
// une coupe à 70 % de la hauteur, que l'utilisateur déplace.
export function toCutSuggestion(image: AlphaImage): CutSuggestion {
  const extents = Array.from({ length: image.height }, (_, y) => toRowExtent(image, y));
  const filled = extents.flatMap((extent, y) => (extent ? [y] : []));
  const firstRow = filled[0];
  const lastRow = filled.at(-1);
  if (firstRow === undefined || lastRow === undefined) return toGuessedCut(image);
  const band = toMouthBand(toBands(extents, firstRow, lastRow), firstRow, lastRow);
  if (!band) return toGuessedCut(image);
  const edges = toBandEdges(extents, band, firstRow, lastRow);
  const y = (band.start + band.end + 1) / 2;
  return {
    cut: { left: { x: edges.left, y }, right: { x: edges.right, y } },
    lips: { isDrawn: false, thickness: DEFAULT_THICKNESS },
    closing: toBandHeight(band) + CLOSING_OVERLAP,
    isGapFound: true,
  };
}

const toLineY = ({ left, right }: Cut, x: number): number =>
  left.x === right.x ? left.y : left.y + ((x - left.x) * (right.y - left.y)) / (right.x - left.x);

// Les deux moitiés comme polygones sur toute la largeur de l'image : la coupe est prolongée jusqu'aux bords. La moitié
// haute descend d'1 px sous la coupe, pour que les deux moitiés se recouvrent sans fil de jour.
export function toPartPolygons(cut: Cut, size: ImageSize): { top: Point[]; bottom: Point[] } {
  const atLeft = toLineY(cut, 0);
  const atRight = toLineY(cut, size.width);
  return {
    top: [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: atRight + 1 },
      { x: 0, y: atLeft + 1 },
    ],
    bottom: [
      { x: 0, y: atLeft },
      { x: size.width, y: atRight },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ],
  };
}

// Un déplacement de la coupe : une charnière à un endroit, ou toute la ligne de `dy` pixels vers le bas.
export type CutMove = { kind: "handle"; side: "left" | "right"; to: Point } | { kind: "line"; dy: number };

// Les charnières restent dans l'image, au dixième de pixel, et ne se croisent pas ; la ligne s'arrête quand une charnière
// touche un bord, sans changer d'écart.
export function toMovedCut(cut: Cut, move: CutMove, size: ImageSize): Cut {
  if (move.kind === "line") {
    const dy = clamp(
      move.dy,
      -Math.min(cut.left.y, cut.right.y),
      size.height - Math.max(cut.left.y, cut.right.y),
    );
    return {
      left: { x: cut.left.x, y: round1(cut.left.y + dy) },
      right: { x: cut.right.x, y: round1(cut.right.y + dy) },
    };
  }
  const y = round1(clamp(move.to.y, 0, size.height));
  if (move.side === "left") {
    return { left: { x: round1(clamp(move.to.x, 0, cut.right.x - MIN_HINGE_GAP)), y }, right: cut.right };
  }
  return {
    left: cut.left,
    right: { x: round1(clamp(move.to.x, cut.left.x + MIN_HINGE_GAP, size.width)), y },
  };
}

const SHIFT_NUDGE = 10;

const toArrow = (key: string): Point | undefined => {
  switch (key) {
    case "ArrowLeft":
      return { x: -1, y: 0 };
    case "ArrowRight":
      return { x: 1, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -1 };
    case "ArrowDown":
      return { x: 0, y: 1 };
    default:
      return undefined;
  }
};

// Le déplacement d'une flèche du clavier : 1 px, 10 px avec Maj. Rien pour une autre touche.
export function toNudge(key: string, isShift: boolean): Point | undefined {
  const arrow = toArrow(key);
  if (!arrow) return undefined;
  const times = isShift ? SHIFT_NUDGE : 1;
  return { x: arrow.x * times, y: arrow.y * times };
}

// La taille d'une image importée : son plus grand côté ne dépasse pas `maxSide`, les proportions sont gardées.
export function toDownscaledSize({ width, height }: ImageSize, maxSide: number): ImageSize {
  const factor = Math.min(1, maxSide / Math.max(width, height));
  if (factor === 1) return { width, height };
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

const toFilePoint = ({ x, y }: Point): Point => ({ x: round1(x), y: round1(y) });

export type ExpressionGeometryInput = {
  name: string;
  size: ImageSize;
  cut: Cut;
  lips: Lips;
  closing: number;
  animation: HeadFile["animation"];
};

// La géométrie que le serveur enregistre (format 2), avec les noms de l'outil de découpe.
export function toExpressionGeometry({
  name,
  size,
  cut,
  lips,
  closing,
  animation,
}: ExpressionGeometryInput): HeadFile {
  return {
    format: "tete-south-park/2",
    nom: name,
    image: { largeur: size.width, hauteur: size.height },
    coupe: { gauche: toFilePoint(cut.left), droite: toFilePoint(cut.right) },
    levres: { trait: lips.isDrawn, epaisseur: lips.thickness },
    fermeture: closing,
    animation,
  };
}

// Ce que l'onglet retrouve d'une géométrie enregistrée, pour retoucher l'expression. Le format 1 n'a ni nom ni closing.
export function toEditableCut(file: HeadFile): EditableCut {
  return {
    name: file.nom ?? "",
    cut: { left: file.coupe.gauche, right: file.coupe.droite },
    lips: file.levres
      ? { isDrawn: file.levres.trait, thickness: file.levres.epaisseur }
      : { isDrawn: false, thickness: DEFAULT_THICKNESS },
    closing: file.fermeture ?? 0,
  };
}
