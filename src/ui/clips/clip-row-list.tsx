// Une liste de clips où l'on choisit une ligne : un titre, une ligne de détails, et la ligne ouverte dans l'éditeur marquée.

import { blurAfterClick } from "../design/button";
import { classNames } from "../design/class-names";

export type ClipRow = { id: string; title: string; details: string };

type ClipRowListProps = {
  rows: readonly ClipRow[];
  selectedId: string | null;
  // Un clip est en cours de traitement : on ne change pas de clip sous lui.
  isDisabled: boolean;
  onSelect: (id: string) => void;
};

export const ClipRowList = ({ rows, selectedId, isDisabled, onSelect }: ClipRowListProps) => (
  <ul className="clip-list">
    {rows.map((row) => (
      <li key={row.id}>
        <button
          type="button"
          className={classNames("clip-row", row.id === selectedId && "is-selected")}
          aria-current={row.id === selectedId ? "true" : undefined}
          disabled={isDisabled}
          onClick={blurAfterClick(() => onSelect(row.id))}
        >
          <span className="clip-row-name lp-type-body">{row.title}</span>
          <span className="clip-row-meta lp-type-caption lp-muted">{row.details}</span>
        </button>
      </li>
    ))}
  </ul>
);
