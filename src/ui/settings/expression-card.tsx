// La carte qui choisit l'expression de la tête : l'onglet Tête et la page Direct la montrent. Sans visage à choisir (un seul,
// la photo), elle n'est pas écrite.

import { type ExpressionSummary, PHOTO_ID } from "../../domain/expression.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { ExpressionThumbs } from "./expression-thumbs";
import { SettingsCard } from "./settings-page";
import type { UseSettings } from "./use-settings";

type ExpressionCardProps = {
  title: string;
  expressions: readonly ExpressionSummary[] | null;
  settings: UseSettings;
  effective: EditableSettings;
};

export const ExpressionCard = ({ title, expressions, settings, effective }: ExpressionCardProps) =>
  expressions && expressions.length > 1 ? (
    <SettingsCard title={title}>
      <ExpressionThumbs
        label="Expression"
        expressions={expressions}
        currentId={effective.expression ?? PHOTO_ID}
        onPick={(id) => void settings.choose(id === PHOTO_ID ? null : id)}
      />
    </SettingsCard>
  ) : null;
