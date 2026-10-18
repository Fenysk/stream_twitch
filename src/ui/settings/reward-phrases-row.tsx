// Les phrases de Jean-Renard d'une récompense de la chaîne : un champ, une phrase par ligne, qui s'applique en perdant le focus,
// et « Tester ». Une récompense du renard (clash, wake) n'a pas de champ ici : ses phrases se règlent dans l'onglet Renard.

import { Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { REWARD_PHRASE_VARIABLES } from "../../domain/reward-phrase.rules";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import { Button } from "../design/button";
import { unlockSound } from "../fox-audio";
import { LinesEditor } from "./lines-editor";

type RewardPhrasesRowProps = {
  entry: RewardPhrasesEntry;
  // Rendent le refus à montrer, ou `null` quand c'est fait.
  onSave: (id: string, phrases: string[]) => Promise<string | null>;
  onTest: (id: string) => Promise<string | null>;
};

const HELP =
  "Une phrase par ligne, tirée au hasard à chaque rachat. Avec un son, elle part quand il se termine. Elle passe devant les messages du chat.";

// Le champ des phrases et « Tester », qui dit celles qui sont enregistrées : il attend donc la fin de l'enregistrement en cours.
const RewardPhrasesEditor = ({ entry, onSave, onTest }: RewardPhrasesRowProps) => {
  const [error, setError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));

  const save = (lines: string[]): Promise<boolean> => {
    const running = onSave(entry.id, lines).then((refusal) => {
      setError(refusal);
      return refusal === null;
    });
    saving.current = running;
    return running;
  };

  const test = async () => {
    unlockSound();
    setIsTesting(true);
    setTestError(null);
    await saving.current;
    setTestError(await onTest(entry.id));
    setIsTesting(false);
  };

  return (
    <div className="reward-phrases">
      <LinesEditor
        label="Phrases de Jean-Renard"
        help={HELP}
        rows={4}
        saved={entry.phrases}
        variables={REWARD_PHRASE_VARIABLES}
        error={error ?? undefined}
        onSave={save}
      />
      <div className="sound-buttons">
        <Button
          label="Tester"
          icon={Volume2}
          isDisabled={entry.phrases.length === 0 || isTesting}
          onPress={() => void test()}
        />
      </div>
      {testError && (
        <p role="alert" className="lp-type-caption lp-danger">
          {testError}
        </p>
      )}
    </div>
  );
};

export const RewardPhrasesRow = (props: RewardPhrasesRowProps) =>
  props.entry.isReserved ? (
    <p className="lp-type-caption lp-muted">Phrases réglées dans l'onglet Renard</p>
  ) : (
    <RewardPhrasesEditor {...props} />
  );
