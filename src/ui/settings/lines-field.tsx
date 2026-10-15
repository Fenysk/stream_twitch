// Une liste de phrases d'un onglet des réglages : le champ de LinesEditor, avec les variables de sa liste, appliqué par les
// réglages du serveur.

import { PHRASE_VARIABLES } from "../../domain/phrase.rules";
import type { EditableSettings } from "../../domain/settings.schema";
import type { ListSpec } from "./head-fields";
import { LinesEditor } from "./lines-editor";
import type { UseSettings } from "./use-settings";

type LinesFieldProps = { spec: ListSpec; settings: UseSettings; effective: EditableSettings };

export const LinesField = ({ spec, settings, effective }: LinesFieldProps) => (
  <LinesEditor
    label={spec.label}
    help={spec.help}
    rows={spec.rows}
    saved={effective[spec.key] ?? []}
    variables={PHRASE_VARIABLES[spec.key] ?? []}
    error={settings.errors.byKey[spec.key]}
    onSave={(lines) => settings.change({ [spec.key]: lines })}
  />
);
