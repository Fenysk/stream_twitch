import type { ExpressionSummary } from "../../../src/domain/expression.schema";
import type { CatalogueState } from "./catalogue-state";

// Ce que le panneau sait lire des réglages d'une touche sans les croire : un texte tel qu'il est écrit, espaces compris (le
// schéma de la touche les retire, mais on ne peut pas écrire « Mon cycle » si l'espace disparaît avant le mot suivant).
export const toDraftName = (settings: Record<string, unknown>): string =>
  typeof settings.name === "string" ? settings.name : "";

// Les expressions du serveur, quand le plugin a pu les lire.
export const toExpressions = (catalogue: CatalogueState): readonly ExpressionSummary[] =>
  catalogue.status === "ready" ? catalogue.expressions : [];
