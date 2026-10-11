import type {
  Cut,
  Head,
  HeadView,
  IdlePose,
  Mouth,
  Pose,
  PoseFactors,
  PoseTransform,
  StageLayout,
} from "./head.types";

// Même calcul que l'aperçu de l'outil « Découpe de tête » (tilt = opening = amplitude), avec l'angle et la levée réglables séparément.
export function toPoseTransform(pose: Pose, cut: Cut, factors: PoseFactors): PoseTransform {
  const angle = pose.angle * factors.tilt * factors.scale;
  if (pose.pivot !== "center") {
    return { origin: pose.pivot === "left" ? cut.left : cut.right, shift: { x: 0, y: 0 }, angle };
  }
  const dx = cut.right.x - cut.left.x;
  const dy = cut.right.y - cut.left.y;
  const length = Math.hypot(dx, dy) || 1;
  const lift = pose.lift * length * factors.opening * factors.scale;
  return {
    origin: { x: (cut.left.x + cut.right.x) / 2, y: (cut.left.y + cut.right.y) / 2 },
    // `0 - …` plutôt que `-…` : pas de -0 quand la coupe est horizontale.
    shift: { x: (dy / length) * lift, y: 0 - (dx / length) * lift },
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

// Les marges de la scène autour de l'image, les mêmes pour toutes les expressions : 17 % de la largeur de chaque côté, 31 % de
// la hauteur en haut, 6 % en bas. Les plus petites qui gardent, dans une source OBS de 800 × 700, la tête entière dans la
// scène au pire cas de chaque curseur (pivot ×2, ouverture ×3, voix ×2, bouche ouverte, penché en parlant 8°, penché au repos 15°).
const STAGE_MARGIN = { side: 0.17, top: 0.31, bottom: 0.06 };

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
    expression: head.expression,
    idle,
    mouth,
  };
}
