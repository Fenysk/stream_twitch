// Le formulaire d'une récompense que l'application gère : son titre, son coût, son cooldown, et à la création un sound facultatif.
// Le même sert à créer une récompense et à en modifier une (le sound se choisit alors dans sa ligne). Le serveur reste juge :
// Twitch dit ce qui ne va pas.

import { useState } from "react";
import type { RewardCreation, RewardSummary } from "../../domain/reward.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import { Menu } from "../design/menu";
import { OwnRewardFields } from "./reward-fields";
import { type Draft, isReady, toDraft, toInput } from "./reward-form-input";
import { toSoundChoices } from "./reward-sound-choices";

type RewardFormProps = {
  // La récompense à modifier ; `null` : une récompense à créer.
  initial: RewardSummary | null;
  // Les sounds à proposer à la création ; `null` : la liste n'est pas lue.
  sounds: readonly SoundSummary[] | null;
  // Rend le refus à montrer, ou `null` quand c'est fait.
  onSubmit: (input: RewardCreation) => Promise<string | null>;
  onCancel?: () => void;
};

export const RewardForm = ({ initial, sounds, onSubmit, onCancel }: RewardFormProps) => {
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  const submit = async () => {
    const form = toInput(draft);
    if (!form.ok) {
      setError(form.message);
      return;
    }
    setIsBusy(true);
    setError(null);
    const refusal = await onSubmit(form.input);
    setIsBusy(false);
    setError(refusal);
    // Une récompense créée vide le formulaire, prêt pour la suivante.
    if (refusal === null && initial === null) setDraft(toDraft(null));
  };

  const canSubmit = isReady(draft) && !isBusy;
  return (
    <form
      className="sound-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <OwnRewardFields
        title={draft.title}
        cost={draft.cost}
        pace={draft.pace}
        isDisabled={isBusy}
        onTitle={(title) => patch({ title })}
        onCost={(cost) => patch({ cost })}
        onPace={(pace) => patch({ pace })}
      />
      {initial === null && (
        <Menu
          label="Son"
          choices={toSoundChoices(sounds)}
          value={draft.sound ?? ""}
          isDisabled={isBusy || sounds === null}
          onSelect={(sound) => patch({ sound: sound === "" ? null : sound })}
        />
      )}
      {error && (
        <p role="alert" className="lp-type-body lp-danger">
          {error}
        </p>
      )}
      <div className="sound-actions">
        <Button
          label={initial ? "Enregistrer" : "Créer la récompense"}
          variant="primary"
          isDisabled={!canSubmit}
          onPress={() => void submit()}
        />
        {onCancel && <Button label="Annuler" isDisabled={isBusy} onPress={onCancel} />}
      </div>
    </form>
  );
};
