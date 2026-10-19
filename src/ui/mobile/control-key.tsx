import type { ControlKey, KeyAction } from "./control-keys";

type ControlKeyButtonProps = { item: ControlKey; onPress: (action: KeyAction) => void };

// Une touche de la grille : active (claire) ou neutre, avec une ligne en dessous quand il y en a une. Un bouton du
// design system, assez haut pour le doigt.
export const ControlKeyButton = ({ item, onPress }: ControlKeyButtonProps) => (
  <button
    type="button"
    className="lp-btn control-key"
    data-state={item.state}
    disabled={item.isDisabled}
    onClick={() => onPress(item.action)}
  >
    <span className="lp-type-body control-key-label">{item.label}</span>
    {item.note && <span className="lp-type-caption control-key-note">{item.note}</span>}
  </button>
);
