import type { Cut, Head, HeadView, Mouth, Pose, PoseFactors, PoseTransform, StageLayout } from "./head.types";

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

export function toStageLayout(size: { width: number; height: number }): StageLayout {
  const top = Math.round(size.height * 0.2);
  const left = Math.round(size.width * 0.08);
  return { width: size.width + 2 * left, height: size.height + top, left, top };
}

export function toHeadView(head: Head, factors: PoseFactors, mouth: Mouth): HeadView {
  return {
    width: head.width,
    height: head.height,
    cut: head.cut,
    tilt: factors.tilt,
    opening: factors.opening,
    scale: factors.scale,
    mouth,
  };
}
