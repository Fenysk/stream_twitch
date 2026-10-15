// Les morceaux du formulaire d'un son qui touchent à sa récompense Twitch : les champs d'une récompense neuve (titre, coût,
// cooldown), le choix d'une récompense déjà faite sur Twitch, et les valeurs de Twitch en lecture seule.

import type { RewardChoice } from "../../domain/sound.schema";
import { SOUND_LIMITS } from "../../domain/sound.schema";
import { ChoiceList } from "../design/choice-list";
import { NumberField } from "../design/number-field";
import { TextField } from "../design/text-field";
import { toPaceText } from "./sound-text";

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
      maxLength={SOUND_LIMITS.titleMax}
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

type TwitchFieldsProps = { title: string; cost: number; pace: number };

// Le titre, le coût et le cooldown d'une récompense qu'Alexis a faite sur Twitch : l'application les lit, elle ne les change pas.
export const TwitchFields = ({ title, cost, pace }: TwitchFieldsProps) => (
  <div className="sound-twitch">
    <p className="lp-type-body">{title}</p>
    <p className="lp-type-caption lp-muted">
      {cost} points · {toPaceText(pace)}
    </p>
    <p className="lp-type-caption lp-muted">Se règle sur Twitch</p>
  </div>
);

type ExistingRewardPickerProps = {
  // `null` : Twitch n'a pas donné la liste (le message est dans l'onglet).
  choices: readonly RewardChoice[] | null;
  value: string | null;
  isDisabled: boolean;
  onPick: (id: string) => void;
};

// Les récompenses de la chaîne qui n'ont pas encore de son.
export const ExistingRewardPicker = ({ choices, value, isDisabled, onPick }: ExistingRewardPickerProps) => {
  if (choices === null) {
    return (
      <p className="lp-type-caption lp-muted">
        La liste des récompenses de Twitch n'est pas lue : le message est plus haut.
      </p>
    );
  }
  if (choices.length === 0) {
    return (
      <p className="lp-type-caption lp-muted">
        Aucune récompense sans son sur Twitch. « Rafraîchir » relit la liste.
      </p>
    );
  }
  return (
    <ChoiceList
      label="Récompense de Twitch"
      options={choices.map(({ id, title, cost, pace, isManageable }) => ({
        value: id,
        label: title,
        note: `${cost} points · ${toPaceText(pace)}${isManageable ? " · créée par l'application" : ""}`,
      }))}
      value={value}
      isDisabled={isDisabled}
      onSelect={onPick}
    />
  );
};
