import { z } from "zod";

export const PointSchema = z.object({ x: z.number(), y: z.number() });

export const CutSchema = z.object({ left: PointSchema, right: PointSchema });

// `pivot` reprend le champ de tete.json : il désigne la charnière d'une pose.
export const PoseSchema = z.discriminatedUnion("pivot", [
  z.object({ pivot: z.enum(["left", "right"]), angle: z.number() }),
  z.object({ pivot: z.literal("center"), angle: z.number(), lift: z.number() }),
]);

export const MouthSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("closed") }),
  z.object({ kind: z.literal("open"), pose: PoseSchema }),
]);

// Quelle expression est montrée, et sa version : l'URL de ses images en dépend, le cache d'OBS ne sert jamais l'ancienne image.
export const ExpressionRefSchema = z.object({ id: z.string().min(1), version: z.string().min(1) });

// Pose de repos de la tête entière : rotation autour du bas-centre de l'image (en degrés), puis levée (fraction de la hauteur).
export const IdlePoseSchema = z.object({ angle: z.number(), lift: z.number() });

// Ce que le serveur envoie à la page : de quoi dessiner, rien d'OBS.
export const HeadViewSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  cut: CutSchema,
  tilt: z.number().min(0),
  opening: z.number().min(0),
  scale: z.number().positive(),
  closing: z.number().min(0),
  expression: ExpressionRefSchema,
  idle: IdlePoseSchema,
  mouth: MouthSchema,
});

// Les deux moitiés de la tête, servies à la page comme images.
export const HeadPartSchema = z.enum(["top", "bottom"]);

// Les images d'une expression : l'image d'origine (pour la retoucher) et ses deux moitiés.
export const ExpressionImagePartSchema = z.enum(["source", "top", "bottom"]);

export type Point = z.infer<typeof PointSchema>;
export type Cut = z.infer<typeof CutSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type Mouth = z.infer<typeof MouthSchema>;
export type IdlePose = z.infer<typeof IdlePoseSchema>;
export type ExpressionRef = z.infer<typeof ExpressionRefSchema>;
export type ExpressionImagePart = z.infer<typeof ExpressionImagePartSchema>;
export type HeadView = z.infer<typeof HeadViewSchema>;
export type HeadPart = z.infer<typeof HeadPartSchema>;
