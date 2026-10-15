import { TextField } from "../../../src/ui/design/text-field";

type KeyNameFieldProps = {
  value: string;
  // Le texte qui s'écrit sur la touche tant que ce champ est vide.
  placeholder: string;
  onInput: (value: string) => void;
};

// Le nom écrit sur la touche, au-dessus de la valeur : à 40 caractères au plus, comme le schéma de ce que la touche garde.
export const KeyNameField = ({ value, placeholder, onInput }: KeyNameFieldProps) => (
  <TextField
    label="Nom sur la touche"
    value={value}
    placeholder={placeholder}
    maxLength={40}
    onInput={onInput}
  />
);
