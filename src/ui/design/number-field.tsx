// Un champ nombre avec son unité (dB, ms, °, ×), dans le style du champ de texte : son libellé est lié au champ, sa phrase
// d'aide dessous, et une erreur du serveur se lit sous l'aide. Il se règle au clavier (flèches) comme à la frappe : chaque
// valeur valide part tout de suite (`onInput`), un champ vidé envoie `null`.

import { useEffect, useId, useRef, useState } from "react";
import { stepNumber, toNumberText, toText } from "./number-text";

type NumberFieldProps = {
  label: string;
  unit: string;
  value: number | null;
  onInput: (value: number | null) => void;
  help?: string;
  error?: string | undefined;
  step?: number;
  placeholder?: string;
  isDisabled?: boolean;
};

export const NumberField = ({
  label,
  unit,
  value,
  onInput,
  help,
  error,
  step = 1,
  placeholder,
  isDisabled = false,
}: NumberFieldProps) => {
  const id = useId();
  const [text, setText] = useState(() => toText(value));
  const isEditing = useRef(false);
  // Une valeur qui arrive d'ailleurs (les valeurs par défaut, le serveur) remplace le texte, sauf pendant la frappe.
  useEffect(() => {
    if (!isEditing.current) setText(toText(value));
  }, [value]);

  const change = (next: string) => {
    setText(next);
    const parsed = toNumberText(next);
    if (parsed.isValid) onInput(parsed.value);
  };
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className="lp-field lp-number-field">
      <label className="lp-type-body" htmlFor={id}>
        {label}
      </label>
      <div className="lp-number-control">
        <input
          id={id}
          className="lp-input lp-number-input lp-type-body"
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          disabled={isDisabled}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={() => {
            isEditing.current = true;
          }}
          onBlur={() => {
            isEditing.current = false;
            setText(toText(value));
          }}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const current = toNumberText(text);
            change(
              toText(
                stepNumber(current.isValid ? current.value : value, event.key === "ArrowUp" ? 1 : -1, step),
              ),
            );
          }}
        />
        <span className="lp-number-unit lp-type-numeric lp-muted">{unit}</span>
      </div>
      {help && (
        <p id={`${id}-help`} className="lp-number-help lp-type-caption lp-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="lp-number-help lp-type-caption lp-danger">
          {error}
        </p>
      )}
    </div>
  );
};
