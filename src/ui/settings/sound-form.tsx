// Le formulaire d'un sound : le fichier audio, son titre et son volume. Le même sert à ajouter un sound et à en modifier un (le
// fichier est alors facultatif : on garde l'ancien). Le serveur reste juge : il dit ce qui ne va pas.

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { SOUND_LIMITS, type SoundInput, type SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import { Slider, type SliderStep } from "../design/slider";
import { TextField } from "../design/text-field";
import { getSoundFile } from "./read-sound-file";
import { type ChosenFile, type Draft, isReady, toDraft, toInput } from "./sound-form-input";

// Un cran par pourcent : le fader se règle au pourcent près.
const FADER_STEPS: readonly SliderStep[] = Array.from({ length: SOUND_LIMITS.faderMax + 1 }, (_, value) => ({
  value,
  label: `${value} %`,
}));

type FilePickerProps = {
  file: ChosenFile | null;
  hasPreviousFile: boolean;
  isDisabled: boolean;
  onChoose: (file: File) => void;
};

// Le bouton qui ouvre le choix du fichier, et ce qu'on sait du fichier : son nom, ou ce qui est permis.
const FilePicker = ({ file, hasPreviousFile, isDisabled, onChoose }: FilePickerProps) => {
  const input = useRef<HTMLInputElement>(null);
  const hint = hasPreviousFile ? "Le fichier actuel est gardé." : "mp3, wav ou ogg, 5 Mo au plus.";
  return (
    <div className="sound-file">
      <Button
        label={file || hasPreviousFile ? "Changer de fichier" : "Choisir un fichier audio"}
        icon={Upload}
        isDisabled={isDisabled}
        onPress={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (chosen) onChoose(chosen);
        }}
      />
      <p className="lp-type-caption lp-muted">{file ? file.name : hint}</p>
    </div>
  );
};

type SoundFormProps = {
  // Le sound à modifier ; `null` : un sound à ajouter.
  initial: SoundSummary | null;
  // Rend le refus à montrer, ou `null` quand le sound est enregistré.
  onSubmit: (input: SoundInput) => Promise<string | null>;
  onCancel?: () => void;
};

export const SoundForm = ({ initial, onSubmit, onCancel }: SoundFormProps) => {
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  const chooseFile = async (chosen: File) => {
    const answer = await getSoundFile(chosen);
    if (answer.ok) patch({ file: { name: chosen.name, base64: answer.base64 } });
    setError(answer.ok ? null : answer.message);
  };

  const submit = async () => {
    setIsBusy(true);
    setError(null);
    const refusal = await onSubmit(toInput(draft));
    setIsBusy(false);
    setError(refusal);
    // Un sound ajouté vide le formulaire, prêt pour le suivant.
    if (refusal === null && initial === null) setDraft(toDraft(null));
  };

  const canSubmit = isReady(draft, initial) && !isBusy;
  return (
    <form
      className="sound-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <FilePicker
        file={draft.file}
        hasPreviousFile={initial !== null}
        isDisabled={isBusy}
        onChoose={(chosen) => void chooseFile(chosen)}
      />
      <TextField
        label="Titre du son"
        value={draft.title}
        onInput={(title) => patch({ title })}
        placeholder="Applaudissements"
        maxLength={SOUND_LIMITS.titleMax}
        isDisabled={isBusy}
      />
      <Slider
        label="Volume"
        steps={FADER_STEPS}
        value={draft.fader}
        onPick={(fader) => patch({ fader })}
        isDisabled={isBusy}
      />
      {error && (
        <p role="alert" className="lp-type-body lp-danger">
          {error}
        </p>
      )}
      <div className="sound-actions">
        <Button
          label={initial ? "Enregistrer" : "Ajouter le son"}
          variant="primary"
          isDisabled={!canSubmit}
          onPress={() => void submit()}
        />
        {onCancel && <Button label="Annuler" isDisabled={isBusy} onPress={onCancel} />}
      </div>
    </form>
  );
};
