import type { DeckSetting, DeckValue } from "../../../src/domain/deck.schema";
import type { ExpressionSummary } from "../../../src/domain/expression.schema";
import { ChoiceList } from "../../../src/ui/design/choice-list";
import { Segmented } from "../../../src/ui/design/segmented";
import { Slider } from "../../../src/ui/design/slider";
import { toChoices, toNearestStep, toSliderSteps } from "../deck-catalogue";

type PairValueProps = {
  setting: DeckSetting;
  value: DeckValue;
  expressions: readonly ExpressionSummary[];
  onChange: (value: DeckValue) => void;
};

// La valeur qu'un préréglage donne à un réglage : un curseur pour un nombre, des boutons pour deux à quatre choix, une liste pour
// les expressions. Les choix s'écrivent en texte (une valeur de bouton radio), on retrouve la valeur par ce texte.
export const PairValue = ({ setting, value, expressions, onChange }: PairValueProps) => {
  const steps = toSliderSteps(setting);
  if (steps) {
    return <Slider label="Valeur" steps={steps} value={toNearestStep(steps, value) ?? 0} onPick={onChange} />;
  }
  const choices = toChoices(setting, expressions);
  const pick = (text: string): void => {
    const chosen = choices.find((choice) => String(choice.value) === text);
    if (chosen) onChange(chosen.value);
  };
  const options = choices.map(({ value: choice, label }) => ({ value: String(choice), label }));
  if (setting === "expression") {
    return <ChoiceList label="Valeur" options={options} value={String(value)} onSelect={pick} />;
  }
  return <Segmented label="Valeur" options={options} value={String(value)} onSelect={pick} />;
};
