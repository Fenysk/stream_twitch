import { type PhraseKind, PhraseKindSchema } from "../../../src/domain/deck.schema";
import { MAX_SPEECH_LENGTH } from "../../../src/domain/voice.rules";
import { Segmented } from "../../../src/ui/design/segmented";
import { TextArea } from "../../../src/ui/design/text-area";
import { DEFAULT_PHRASE_NAMES, PHRASE_CHOICES } from "../deck-catalogue";
import { toDraftName } from "./draft";
import { KeyNameField } from "./key-name-field";

// Ce que la touche garde, tel qu'il est écrit dans le panneau : le texte reste quand on passe au bilan.
type PhraseDraft = { kind: PhraseKind; text: string; name: string };

type PhraseFormProps = {
  settings: Record<string, unknown>;
  onChange: (settings: PhraseDraft) => void;
};

export const PhraseForm = ({ settings, onChange }: PhraseFormProps) => {
  const parsed = PhraseKindSchema.safeParse(settings.kind);
  const kind = parsed.success ? parsed.data : "text";
  const text = typeof settings.text === "string" ? settings.text : "";
  const name = toDraftName(settings);
  const draft = (next: Partial<PhraseDraft>): PhraseDraft => ({ kind, text, name, ...next });
  return (
    <>
      <Segmented
        label="Ce que dit la touche"
        options={PHRASE_CHOICES}
        value={kind}
        onSelect={(chosen) => onChange(draft({ kind: chosen }))}
      />
      {kind === "text" ? (
        <>
          <TextArea
            label="Phrase"
            value={text}
            rows={4}
            placeholder="Ce que Jean-Renard dit"
            onInput={(typed) => onChange(draft({ text: typed }))}
          />
          <p className="lp-type-caption lp-muted">
            {MAX_SPEECH_LENGTH} caractères au plus : le reste est coupé.
          </p>
        </>
      ) : (
        <p className="lp-type-caption lp-muted">
          Jean-Renard dit le bilan du live au tchat. S&apos;il n&apos;y a rien à dire, la touche signale une
          erreur.
        </p>
      )}
      <KeyNameField
        value={name}
        placeholder={DEFAULT_PHRASE_NAMES[kind]}
        onInput={(typed) => onChange(draft({ name: typed }))}
      />
    </>
  );
};
