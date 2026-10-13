// Une liste de phrases d'un onglet : un champ multiligne, une phrase par ligne, les variables permises écrites dessous, et le
// refus du serveur s'il y en a un. Elle s'applique quand le champ perd le focus (pas de bouton Enregistrer) ; un refus
// laisse ce qu'on a écrit, pour le corriger.

import { useState } from "react";
import { PHRASE_VARIABLES, toPhraseLines, toPhraseText } from "../../domain/phrase.rules";
import type { EditableSettings } from "../../domain/settings.schema";
import { TextArea } from "../design/text-area";
import type { ListSpec } from "./head-fields";
import type { UseSettings } from "./use-settings";

type LinesFieldProps = { spec: ListSpec; settings: UseSettings; effective: EditableSettings };

const isSameList = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((phrase, index) => phrase === second[index]);

export const LinesField = ({ spec, settings, effective }: LinesFieldProps) => {
  const saved = effective[spec.key] ?? [];
  // Ce qu'on est en train d'écrire ; `null` : rien en cours, le champ montre la liste qui s'applique.
  const [draft, setDraft] = useState<string | null>(null);
  const error = settings.errors.byKey[spec.key];
  const variables = PHRASE_VARIABLES[spec.key] ?? [];

  const commit = async () => {
    if (draft === null) return;
    const lines = toPhraseLines(draft);
    if (!isSameList(lines, saved) && !(await settings.change({ [spec.key]: lines }))) return;
    setDraft(null);
  };

  return (
    <div className="settings-lines">
      <TextArea
        label={spec.label}
        value={draft ?? toPhraseText(saved)}
        rows={spec.rows ?? 6}
        onInput={setDraft}
        onCommit={() => void commit()}
      />
      <p className="lp-type-caption lp-muted">{spec.help}</p>
      {variables.length > 0 && (
        <p className="lp-type-caption lp-muted">
          Variables : {variables.map((name) => `{${name}}`).join(", ")}
        </p>
      )}
      {error && (
        <p role="alert" className="lp-type-caption lp-danger">
          {error}
        </p>
      )}
    </div>
  );
};
