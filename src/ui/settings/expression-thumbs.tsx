// Une rangée de vignettes, une par expression, avec son nom dessous. Une vignette empile les deux moitiés de l'image :
// la tête bouche fermée. La vignette choisie est cerclée.

import type { ExpressionSummary } from "../../domain/expression.schema";
import { classNames } from "../design/class-names";
import { toImageUrls } from "../expression-urls";

type ExpressionThumbsProps = {
  label: string;
  expressions: readonly ExpressionSummary[];
  currentId: string | null;
  onPick: (id: string) => void;
};

export const ExpressionThumbs = ({ label, expressions, currentId, onPick }: ExpressionThumbsProps) => (
  <ul className="expression-thumbs" aria-label={label}>
    {expressions.map(({ id, name, version }) => {
      const images = toImageUrls({ id, version });
      const isCurrent = id === currentId;
      return (
        <li key={id}>
          <button
            type="button"
            className={classNames("expression-thumb", isCurrent && "is-selected")}
            aria-pressed={isCurrent}
            onClick={() => onPick(id)}
          >
            <span className="expression-thumb-image">
              <img src={images.bottom} alt="" draggable={false} />
              <img src={images.top} alt="" draggable={false} />
            </span>
            <span className="expression-thumb-name lp-type-caption">{name}</span>
          </button>
        </li>
      );
    })}
  </ul>
);
