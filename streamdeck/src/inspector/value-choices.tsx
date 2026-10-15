import type { DeckValue } from "../../../src/domain/deck.schema";
import { Checkbox } from "../../../src/ui/design/checkbox";
import type { DeckChoice } from "../deck-catalogue";

// Ce qui est coché reste dans l'ordre des choix, pas dans celui des clics : le cycle parcourt toujours les valeurs de la même façon.
export const toCheckedValues = (
  choices: readonly DeckChoice[],
  selected: readonly DeckValue[],
  changed: DeckValue,
  isChecked: boolean,
): DeckValue[] =>
  choices
    .filter((choice) => (choice.value === changed ? isChecked : selected.includes(choice.value)))
    .map((choice) => choice.value);

type ValueChoicesProps = {
  label: string;
  choices: readonly DeckChoice[];
  selected: readonly DeckValue[];
  onChange: (values: DeckValue[]) => void;
};

// Des cases à cocher sur les valeurs d'un réglage.
export const ValueChoices = ({ label, choices, selected, onChange }: ValueChoicesProps) => (
  <fieldset className="inspector-values">
    <legend className="lp-type-body">{label}</legend>
    <div className="inspector-values-grid">
      {choices.map((choice) => (
        <Checkbox
          key={String(choice.value)}
          label={choice.label}
          isChecked={selected.includes(choice.value)}
          onToggle={(isChecked) => onChange(toCheckedValues(choices, selected, choice.value, isChecked))}
        />
      ))}
    </div>
  </fieldset>
);
