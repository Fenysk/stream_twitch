// Le formulaire d'un son : le fichier audio, la récompense (neuve : titre, coût et cooldown ; ou une récompense déjà faite sur
// Twitch, dont les valeurs se lisent et ne se changent pas ici), et le volume. Le même sert à ajouter un son et à en modifier
// un (le fichier est alors facultatif : on garde l'ancien). Le serveur reste juge : il dit ce qui ne va pas.

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  type RewardChoice,
  SOUND_LIMITS,
  type SoundInput,
  type SoundSummary,
} from "../../domain/sound.schema";
import { Button } from "../design/button";
import { Segmented, type SegmentedOption } from "../design/segmented";
import { Slider, type SliderStep } from "../design/slider";
import { getSoundFile } from "./read-sound-file";
import { ExistingRewardPicker, OwnRewardFields, TwitchFields } from "./reward-fields";
import {
  type ChosenFile,
  type Draft,
  isReady,
  type RewardSource,
  toDraft,
  toInput,
} from "./sound-form-input";

// Un cran par pourcent : le fader se règle au pourcent près.
const FADER_STEPS: readonly SliderStep[] = Array.from({ length: SOUND_LIMITS.faderMax + 1 }, (_, value) => ({
  value,
  label: `${value} %`,
}));

const SOURCES: readonly SegmentedOption<RewardSource>[] = [
  { value: "new", label: "Nouvelle récompense" },
  { value: "existing", label: "Récompense existante" },
];

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

type RewardPartProps = {
  initial: SoundSummary | null;
  draft: Draft;
  choices: readonly RewardChoice[] | null;
  isBusy: boolean;
  patch: (change: Partial<Draft>) => void;
};

// La partie « récompense » : à la création, le choix entre une récompense neuve et une existante ; à la modification, les
// champs de la récompense de l'app, ou les valeurs de Twitch en lecture seule quand l'app ne la gère pas.
const RewardPart = ({ initial, draft, choices, isBusy, patch }: RewardPartProps) => {
  if (initial && !initial.isManaged) {
    return <TwitchFields title={initial.title} cost={initial.cost} pace={initial.pace} />;
  }
  const fields = (
    <OwnRewardFields
      title={draft.title}
      cost={draft.cost}
      pace={draft.pace}
      isDisabled={isBusy}
      onTitle={(title) => patch({ title })}
      onCost={(cost) => patch({ cost })}
      onPace={(pace) => patch({ pace })}
    />
  );
  if (initial) return fields;
  return (
    <>
      <Segmented
        label="Récompense"
        options={SOURCES}
        value={draft.source}
        onSelect={(source) => patch({ source })}
      />
      {draft.source === "new" ? (
        fields
      ) : (
        <ExistingRewardPicker
          choices={choices}
          value={draft.rewardId}
          isDisabled={isBusy}
          onPick={(rewardId) => patch({ rewardId })}
        />
      )}
    </>
  );
};

type SoundFormProps = {
  // Le son à modifier ; `null` : un son à ajouter.
  initial: SoundSummary | null;
  // Les récompenses de la chaîne qui n'ont pas de son ; `null` : Twitch ne les a pas données.
  choices: readonly RewardChoice[] | null;
  // Rend le refus à montrer, ou `null` quand le son est enregistré.
  onSubmit: (input: SoundInput) => Promise<string | null>;
  onCancel?: () => void;
};

export const SoundForm = ({ initial, choices, onSubmit, onCancel }: SoundFormProps) => {
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
    const form = toInput(draft, choices);
    if (!form.ok) {
      setError(form.message);
      return;
    }
    setIsBusy(true);
    setError(null);
    const refusal = await onSubmit(form.input);
    setIsBusy(false);
    setError(refusal);
    // Un son ajouté vide le formulaire, prêt pour le suivant.
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
      <RewardPart initial={initial} draft={draft} choices={choices} isBusy={isBusy} patch={patch} />
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
