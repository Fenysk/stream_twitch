import {
  DECK_SETTINGS,
  type DeckSetting,
  type DeckValue,
  type PresetPair,
} from "../../../src/domain/deck.schema";
import type { ExpressionSummary } from "../../../src/domain/expression.schema";
import { toChoices, toNearestStep, toSliderSteps } from "../deck-catalogue";
import type { CatalogueState } from "./catalogue-state";

// Les paires du préréglage une fois celle d'un réglage posée (`undefined` : retirée), toujours dans l'ordre des réglages offerts.
export const toUpdatedPairs = (
  pairs: readonly PresetPair[],
  setting: DeckSetting,
  next: PresetPair | undefined,
): PresetPair[] =>
  DECK_SETTINGS.flatMap((offered) =>
    offered === setting ? (next ? [next] : []) : pairs.filter((pair) => pair.setting === offered),
  );

// La valeur d'un réglage qu'on vient de cocher : celle qui s'applique en ce moment (le cran le plus proche pour un curseur), sinon le
// premier choix. Rien quand il n'y a aucun choix : une expression, tant que le serveur n'a pas dit lesquelles.
export const toInitialValue = (
  setting: DeckSetting,
  catalogue: CatalogueState,
  expressions: readonly ExpressionSummary[],
): DeckValue | undefined => {
  const choices = toChoices(setting, expressions);
  const current = catalogue.status === "ready" ? catalogue.values[setting] : undefined;
  if (current !== undefined && choices.some((choice) => choice.value === current)) return current;
  const steps = toSliderSteps(setting);
  if (steps && current !== undefined) return toNearestStep(steps, current);
  return choices[0]?.value;
};
