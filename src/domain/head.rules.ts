import type {
  Cut,
  Head,
  HeadView,
  IdlePose,
  Mouth,
  Pose,
  PoseBasis,
  PoseFactors,
  PoseTransform,
  StageLayout,
} from "./head.types";

// La longueur de référence de la coupe est celle de la photo (tete-south-park/tete.json : 104,8 px de coupe pour 333,7 px du haut
// de l'image au milieu de la coupe, soit 0,314), mise à l'échelle de la hauteur du haut de l'expression. Sans elle, une coupe
// longue devant la tête (les avatars : 0,86 à 0,90) ouvrirait la bouche presque trois fois trop.
const PHOTO_CUT_LENGTH = Math.hypot(345.1 - 240.3, 334.2 - 333.2);
const PHOTO_TOP_HEIGHT = (333.2 + 334.2) / 2;
export const REFERENCE_RATIO = PHOTO_CUT_LENGTH / PHOTO_TOP_HEIGHT;

// Écrit comme un rapport à la photo, pour que la photo retrouve exactement la longueur de sa coupe.
export const toReferenceLength = (topHeight: number): number =>
  PHOTO_CUT_LENGTH * (topHeight / PHOTO_TOP_HEIGHT);

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

// L'angle d'une pose pour que l'écart au bout de la coupe soit celui d'une coupe de la longueur de référence. Une coupe de
// cette longueur, ou aucune coupe (points confondus), ne change rien.
const toNormalizedAngle = (angle: number, length: number, reference: number): number => {
  if (length === 0 || reference === length) return angle;
  const sine = Math.max(-1, Math.min(1, (reference / length) * Math.sin(toRadians(angle))));
  return toDegrees(Math.asin(sine));
};

// La moitié haute part toujours de la position fermée (descendue de `closing`), puis la pose s'ajoute par-dessus : la levée
// se compte depuis la mâchoire, l'angle tourne la moitié déjà descendue. La levée et l'angle se mesurent sur la hauteur du
// haut (longueur de référence), pas sur la longueur de la coupe ; sans closing, la photo garde son calcul d'avant.
export function toPoseTransform(pose: Pose, cut: Cut, factors: PoseFactors, basis: PoseBasis): PoseTransform {
  const dx = cut.right.x - cut.left.x;
  const dy = cut.right.y - cut.left.y;
  const rawLength = Math.hypot(dx, dy);
  const length = rawLength || 1;
  const reference = toReferenceLength(basis.topHeight);
  const angle = toNormalizedAngle(pose.angle, rawLength, reference) * factors.tilt * factors.scale;
  const closed = toClosedTransform(cut, basis.closing).shift;
  const radians = toRadians(angle);
  // Le décalage de la position fermée tourne avec la moitié haute ; `+ 0` : pas de -0.
  const down = {
    x: closed.x * Math.cos(radians) - closed.y * Math.sin(radians) + 0,
    y: closed.x * Math.sin(radians) + closed.y * Math.cos(radians) + 0,
  };
  if (pose.pivot !== "center") {
    return { origin: pose.pivot === "left" ? cut.left : cut.right, shift: down, angle };
  }
  const lift = pose.lift * reference * factors.opening * factors.scale;
  return {
    origin: { x: (cut.left.x + cut.right.x) / 2, y: (cut.left.y + cut.right.y) / 2 },
    // `0 - …` plutôt que `-…` : pas de -0 quand la coupe est horizontale.
    shift: { x: (dy / length) * lift + down.x, y: 0 - (dx / length) * lift + down.y },
    angle,
  };
}

// Bouche fermée, la moitié haute descend de `closing` px, perpendiculairement à la coupe (à l'inverse de la levée), pour toucher la mâchoire.
export function toClosedTransform(cut: Cut, closing: number): PoseTransform {
  const dx = cut.right.x - cut.left.x;
  const dy = cut.right.y - cut.left.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    origin: { x: (cut.left.x + cut.right.x) / 2, y: (cut.left.y + cut.right.y) / 2 },
    shift: { x: 0 - (dy / length) * closing, y: (dx / length) * closing },
    angle: 0,
  };
}

// Les marges de la scène autour de l'image, les mêmes pour toutes les expressions : 17 % de la largeur de chaque côté, 9 % de
// la hauteur en haut, 6 % en bas. Les plus petites qui gardent, dans une source OBS de 800 × 700, la tête entière dans la
// scène au pire cas de chaque curseur (pivot ×2, ouverture ×3, voix ×2, bouche ouverte, penché en parlant 8°, penché au repos 15°),
// poses de la bouche normalisées sur la hauteur du haut.
const STAGE_MARGIN = { side: 0.17, top: 0.09, bottom: 0.06 };

export function toStageLayout(size: { width: number; height: number }): StageLayout {
  const left = Math.round(size.width * STAGE_MARGIN.side);
  const top = Math.round(size.height * STAGE_MARGIN.top);
  const bottom = Math.round(size.height * STAGE_MARGIN.bottom);
  return { width: size.width + 2 * left, height: size.height + top + bottom, left, top };
}

export function toHeadView(head: Head, factors: PoseFactors, mouth: Mouth, idle: IdlePose): HeadView {
  return {
    width: head.width,
    height: head.height,
    cut: head.cut,
    tilt: factors.tilt,
    opening: factors.opening,
    scale: factors.scale,
    closing: head.closing,
    topHeight: head.topHeight,
    expression: head.expression,
    idle,
    mouth,
  };
}
