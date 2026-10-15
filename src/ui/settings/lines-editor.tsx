// Une liste de phrases à écrire : un champ multiligne, une phrase par ligne, les variables permises écrites dessous, et le refus du
// serveur s'il y en a un. Elle s'applique quand le champ perd le focus (pas de bouton Enregistrer) ; un refus laisse ce qu'on a
// écrit, pour le corriger. Les listes des réglages (LinesField) et les phrases d'une récompense s'en servent.

import { useState } from "react";
import { toPhraseLines, toPhraseText } from "../../domain/phrase.rules";
import { TextArea } from "../design/text-area";

type LinesEditorProps = {
  label: string;
  help: string;
  rows?: number | undefined;
  // La liste qui s'applique.
  saved: readonly string[];
  // Les variables permises dans une phrase.
  variables: readonly string[];
  error?: string | undefined;
  // Applique la liste écrite ; rend faux quand le serveur la refuse.
  onSave: (lines: string[]) => Promise<boolean>;
};

const isSameList = (first: readonly string[], second: readonly string[]): boolean =>
  first.length === second.length && first.every((phrase, index) => phrase === second[index]);

export const LinesEditor = ({ label, help, rows, saved, variables, error, onSave }: LinesEditorProps) => {
  // Ce qu'on est en train d'écrire ; `null` : rien en cours, le champ montre la liste qui s'applique.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = async () => {
    if (draft === null) return;
    const lines = toPhraseLines(draft);
    if (!isSameList(lines, saved) && !(await onSave(lines))) return;
    setDraft(null);
  };

  return (
    <div className="settings-lines">
      <TextArea
        label={label}
        value={draft ?? toPhraseText(saved)}
        rows={rows ?? 6}
        onInput={setDraft}
        onCommit={() => void commit()}
      />
      <p className="lp-type-caption lp-muted">{help}</p>
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
