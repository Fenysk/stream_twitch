import { z } from "zod";
import type { ExpressionRef, Head, Pose } from "./head.types";

// Format de `tete-south-park/tete.json` (1), et de la géométrie d'une expression (2 : `nom` et `fermeture` en plus) :
// produits par l'outil « Découpe de tête », on garde ses noms ici.
const FilePointSchema = z.object({ x: z.number(), y: z.number() });

const FilePoseSchema = z.discriminatedUnion("pivot", [
  z.object({ pivot: z.enum(["gauche", "droite"]), angle: z.number() }),
  z.object({ pivot: z.literal("centre"), angle: z.number(), levee: z.number() }),
]);

export const HeadFileSchema = z.object({
  format: z.enum(["tete-south-park/1", "tete-south-park/2"]),
  nom: z.string().optional(),
  source: z.string().optional(),
  image: z.object({ largeur: z.number().positive(), hauteur: z.number().positive() }),
  coupe: z.object({ gauche: FilePointSchema, droite: FilePointSchema }),
  levres: z.object({ trait: z.boolean(), epaisseur: z.number().positive() }).optional(),
  fermeture: z.number().min(0).optional(),
  animation: z.object({
    rythmeMs: z.number().positive(),
    amplitude: z.number().positive(),
    probabiliteFermee: z.number().min(0).max(1),
    poses: z.array(FilePoseSchema).min(2),
  }),
});

export type HeadFile = z.infer<typeof HeadFileSchema>;

const SIDES = { gauche: "left", droite: "right" } as const;

function toPose(file: HeadFile["animation"]["poses"][number]): Pose {
  if (file.pivot === "centre") return { pivot: "center", angle: file.angle, lift: file.levee };
  return { pivot: SIDES[file.pivot], angle: file.angle };
}

// Seul endroit où les noms de l'outil deviennent ceux du domaine.
export function toHead(file: HeadFile, expression: ExpressionRef): Head {
  return {
    width: file.image.largeur,
    height: file.image.hauteur,
    cut: { left: file.coupe.gauche, right: file.coupe.droite },
    poses: file.animation.poses.map(toPose),
    rhythm: file.animation.rythmeMs,
    opening: file.animation.amplitude,
    closedChance: file.animation.probabiliteFermee,
    closing: file.fermeture ?? 0,
    expression,
  };
}
