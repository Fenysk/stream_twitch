import type { Cut, ExpressionRef, Point, Pose } from "./head-view.schema";

export type {
  Cut,
  ExpressionImagePart,
  ExpressionRef,
  HeadPart,
  HeadView,
  IdlePose,
  Mouth,
  Point,
  Pose,
} from "./head-view.schema";

export type Head = {
  width: number;
  height: number;
  cut: Cut;
  poses: Pose[];
  rhythm: number;
  opening: number;
  closedChance: number;
  closing: number;
  expression: ExpressionRef;
};

// Les facteurs de la moitié haute : `tilt` multiplie l'angle, `opening` la levée, `scale` (selon le level) les deux.
export type PoseFactors = { tilt: number; opening: number; scale: number };

// Rotation de la moitié haute : autour de `origin`, après un décalage de `shift` (en pixels de l'image).
export type PoseTransform = { origin: Point; shift: Point; angle: number };

// La scène laisse de la place autour de la tête pour que la moitié haute reste entière en tournant.
export type StageLayout = { width: number; height: number; left: number; top: number };
