import { z } from "zod";
import { HeadFileSchema } from "./head.schema";

// La photo intégrée (`tete-south-park/`, suivie par git) : l'expression par défaut, jamais supprimée.
export const PHOTO_ID = "photo";

export const ExpressionNameSchema = z
  .string("doit être un texte")
  .trim()
  .min(1, "ne peut pas être vide")
  .max(40, "40 caractères au plus");

// Ce que l'interface envoie pour créer ou mettre à jour une expression : son nom, sa géométrie (format 2) et ses images
// en base64. L'image d'origine manque à la mise à jour quand on la garde.
export const ExpressionInputSchema = z.object({
  name: ExpressionNameSchema,
  geometry: HeadFileSchema,
  source: z.string().optional(),
  top: z.string(),
  bottom: z.string(),
});
export type ExpressionInput = z.infer<typeof ExpressionInputSchema>;

export const ExpressionSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.string().min(1),
  isBuiltIn: z.boolean(),
});
export type ExpressionSummary = z.infer<typeof ExpressionSummarySchema>;

export const ExpressionListSchema = z.object({ expressions: z.array(ExpressionSummarySchema) });

// Une expression à rouvrir dans l'onglet « Découpe » : de quoi retrouver ses réglages.
export const ExpressionDetailSchema = ExpressionSummarySchema.extend({ geometry: HeadFileSchema });
export type ExpressionDetail = z.infer<typeof ExpressionDetailSchema>;

// Un refus du serveur : l'élément fautif (vide pour une panne) et ce qui est attendu.
export const ExpressionIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ExpressionIssue = z.infer<typeof ExpressionIssueSchema>;
export const ExpressionRefusalSchema = z.object({ issues: z.array(ExpressionIssueSchema) });
