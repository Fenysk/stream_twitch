// Le sound du rire choisi sous la timeline : l'un des sounds de la soundboard, par son titre, sans « Aucun » (un rire retiré se retire avec
// « Retirer »). La page `/show` joue ce sound à l'instant du rire.

import type { SoundSummary } from "../../domain/sound.schema";
import { ChoiceList, type ChoiceOption } from "../design/choice-list";

// Les sounds par ordre alphabétique de titre.
export const toLaughChoices = (sounds: readonly SoundSummary[] | null): ChoiceOption<string>[] =>
  [...(sounds ?? [])]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(({ id, title }) => ({ value: id, label: title }));

type LaughChoiceProps = {
  // `null` tant que la soundboard n'est pas lue : rien à choisir.
  sounds: readonly SoundSummary[] | null;
  // L'identifiant du sound du rire.
  value: string;
  isDisabled: boolean;
  onSelect: (value: string) => void;
};

export const LaughChoice = ({ sounds, value, isDisabled, onSelect }: LaughChoiceProps) => (
  <div className="clip-laugh">
    <ChoiceList
      label="Sound du rire"
      options={toLaughChoices(sounds)}
      value={value}
      onSelect={onSelect}
      isDisabled={isDisabled}
    />
    <p className="lp-type-caption lp-muted">Un sound de la soundboard, joué à l'instant du rire.</p>
  </div>
);
