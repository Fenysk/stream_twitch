// Un menu de choix : un `<select>` natif, sur le fond des champs (text-field.css). Son libellé est lié au menu, que le clavier et les
// lecteurs d'écran connaissent déjà.

import { useId } from "react";

export type MenuChoice = { value: string; label: string };

type MenuProps = {
  label: string;
  choices: readonly MenuChoice[];
  value: string;
  onSelect: (value: string) => void;
  isDisabled?: boolean;
};

export const Menu = ({ label, choices, value, onSelect, isDisabled = false }: MenuProps) => {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-type-body" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="lp-input lp-type-body"
        value={value}
        disabled={isDisabled}
        onChange={(event) => onSelect(event.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
};
