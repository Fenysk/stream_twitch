// Les champs d'une récompense que l'application crée sur Twitch : son titre, son coût et son cooldown. Le formulaire de création et
// celui de modification les partagent.

import { REWARD_LIMITS } from "../../domain/reward.schema";
import { NumberField } from "../design/number-field";
import { TextField } from "../design/text-field";

type OwnRewardFieldsProps = {
  title: string;
  cost: number | null;
  pace: number | null;
  isDisabled: boolean;
  onTitle: (title: string) => void;
  onCost: (cost: number | null) => void;
  onPace: (pace: number | null) => void;
};

// Le titre, le coût et le cooldown de la récompense que l'application crée sur Twitch.
export const OwnRewardFields = ({
  title,
  cost,
  pace,
  isDisabled,
  onTitle,
  onCost,
  onPace,
}: OwnRewardFieldsProps) => (
  <>
    <TextField
      label="Titre de la récompense"
      value={title}
      onInput={onTitle}
      placeholder="Applaudissements"
      maxLength={REWARD_LIMITS.titleMax}
      isDisabled={isDisabled}
    />
    <div className="sound-numbers">
      <NumberField label="Coût" unit="points" value={cost} onInput={onCost} isDisabled={isDisabled} />
      <NumberField
        label="Cooldown global"
        unit="s"
        value={pace}
        onInput={onPace}
        help="0 = aucun"
        isDisabled={isDisabled}
      />
    </div>
  </>
);
