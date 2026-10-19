import { ControlKeyButton } from "./control-key";
import type { ControlKey } from "./control-keys";

type KeyListProps = {
  keys: ControlKey[];
  // Ce que la liste dit à la place des touches quand elle n'en a aucune.
  emptyText: string;
  onPress: (item: ControlKey) => void;
};

// Une colonne de touches, ou la phrase qui dit pourquoi il n'y en a pas : le contenu des menus (scènes, micros) et des sections de la feuille
// Antenne. Ce que fait un toucher (fermer ou non) est à celui qui la porte.
export const KeyList = ({ keys, emptyText, onPress }: KeyListProps) =>
  keys.length === 0 ? (
    <p className="lp-type-body lp-muted control-empty" role="status">
      {emptyText}
    </p>
  ) : (
    <div className="control-menu-list">
      {keys.map((item) => (
        <ControlKeyButton key={item.id} item={item} onPress={() => onPress(item)} />
      ))}
    </div>
  );
