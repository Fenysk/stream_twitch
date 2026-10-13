// « Faire parler » : une phrase, et Jean-Renard la dit dans OBS et dans l'aperçu. Une seule page fait entendre la voix :
// quand OBS a la page `/fox`, l'aperçu reste muet. Le clic (ou Entrée) débloque le son de l'aperçu : un navigateur ordinaire
// ne joue qu'après un geste.

import { Volume2 } from "lucide-react";
import { useState } from "react";
import { MAX_SPEECH_LENGTH } from "../../domain/voice.rules";
import { Button } from "../design/button";
import { TextField } from "../design/text-field";
import { speak } from "../fox-api";
import { unlockSound } from "../fox-audio";

type FoxSpeakFormProps = { isMuted: boolean };

export const FoxSpeakForm = ({ isMuted }: FoxSpeakFormProps) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const say = async () => {
    unlockSound();
    setIsSending(true);
    setError(null);
    const answer = await speak(text);
    setIsSending(false);
    if (!answer.ok) setError(answer.message);
  };

  return (
    <form
      className="fox-speak"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() !== "" && !isSending) void say();
      }}
    >
      <TextField
        label="Phrase"
        value={text}
        onInput={setText}
        placeholder="Ce que Jean-Renard dit"
        maxLength={MAX_SPEECH_LENGTH}
      />
      <div className="fox-speak-actions">
        <Button
          label="Faire parler"
          icon={Volume2}
          isDisabled={text.trim() === "" || isSending}
          onPress={() => void say()}
        />
      </div>
      {isMuted && (
        <p className="lp-type-caption lp-muted">
          La page /fox est ouverte (OBS) : le son sort de là, l'aperçu reste muet.
        </p>
      )}
      {error && (
        <p role="alert" className="lp-type-body lp-danger">
          {error}
        </p>
      )}
    </form>
  );
};
