// Un champ de texte sur plusieurs lignes (JOURNAL 2026-10-13) : une liste de phrases, une par ligne. Son libellé est lié au
// champ. Avec `onCommit`, il se valide en perdant le focus : un réglage sans bouton Enregistrer. Entrée fait une nouvelle
// ligne, elle ne valide pas.

import { useId } from "react";

type TextAreaProps = {
  label: string;
  value: string;
  onInput: (value: string) => void;
  rows?: number;
  placeholder?: string;
  isDisabled?: boolean;
  onCommit?: () => void;
};

export const TextArea = ({
  label,
  value,
  onInput,
  rows = 6,
  placeholder,
  isDisabled = false,
  onCommit,
}: TextAreaProps) => {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-type-body" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="lp-input lp-textarea lp-type-body"
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={isDisabled}
        spellCheck={false}
        onChange={(event) => onInput(event.target.value)}
        onBlur={onCommit}
      />
    </div>
  );
};
