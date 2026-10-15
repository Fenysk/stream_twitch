import { toCycleBinding } from "../../../src/domain/deck.rules";
import { DECK_CYCLE_SETTINGS, type DeckCycleSetting, type DeckValue } from "../../../src/domain/deck.schema";
import { ChoiceList } from "../../../src/ui/design/choice-list";
import { type DeckChoice, toCycleChoices, toSettingLabel, toValueLabel } from "../deck-catalogue";
import type { CatalogueState } from "./catalogue-state";
import { toDraftName, toExpressions } from "./draft";
import { KeyNameField } from "./key-name-field";
import { ValueChoices } from "./value-choices";

// Une touche qu'on vient de poser n'a pas encore de réglage : le formulaire garde ce qui est choisi, le reste attend.
type CycleDraft = { setting?: DeckCycleSetting; values: DeckValue[]; name: string };

type CycleFormProps = {
  settings: Record<string, unknown>;
  catalogue: CatalogueState;
  onChange: (settings: CycleDraft) => void;
};

// La valeur qui s'applique maintenant, sous le libellé du réglage, quand le plugin a pu lire le serveur.
const toNote = (catalogue: CatalogueState, setting: DeckCycleSetting): string | undefined => {
  if (catalogue.status !== "ready") return undefined;
  const value = catalogue.values[setting];
  return value === undefined
    ? undefined
    : `${toValueLabel(setting, value, catalogue.expressions)} en ce moment`;
};

// Les choix du réglage, et ceux déjà cochés que la liste ne connaît plus (une expression supprimée, un serveur qui ne répond pas) : on peut les décocher.
const withChosen = (choices: readonly DeckChoice[], chosen: readonly DeckValue[]): DeckChoice[] => [
  ...choices,
  ...chosen
    .filter((value) => !choices.some((choice) => choice.value === value))
    .map((value) => ({ value, label: String(value) })),
];

export const CycleForm = ({ settings, catalogue, onChange }: CycleFormProps) => {
  const binding = toCycleBinding(settings);
  const setting = binding?.setting;
  const values = binding?.values ?? [];
  const name = toDraftName(settings);
  const draft = (next: Partial<CycleDraft>): CycleDraft => ({
    ...(setting && { setting }),
    values,
    name,
    ...next,
  });
  const choices = setting ? withChosen(toCycleChoices(setting, toExpressions(catalogue)), values) : [];
  const chosenLabels = choices
    .filter((choice) => values.includes(choice.value))
    .map((choice) => choice.label);
  return (
    <>
      <ChoiceList
        label="Réglage à parcourir"
        options={DECK_CYCLE_SETTINGS.map((option) => {
          const note = toNote(catalogue, option);
          return { value: option, label: toSettingLabel(option), ...(note === undefined ? {} : { note }) };
        })}
        value={setting ?? null}
        onSelect={(chosen) => onChange(draft({ setting: chosen, values: [] }))}
      />
      {setting && (
        <ValueChoices
          label="Valeurs du cycle"
          choices={choices}
          selected={values}
          onChange={(chosen) => onChange(draft({ values: chosen }))}
        />
      )}
      {chosenLabels.length > 1 && (
        <p className="lp-type-caption lp-muted">
          Chaque appui passe à la valeur suivante : {chosenLabels.join(", ")}, puis {chosenLabels[0]} de
          nouveau.
        </p>
      )}
      <KeyNameField
        value={name}
        placeholder={setting ? toSettingLabel(setting) : ""}
        onInput={(typed) => onChange(draft({ name: typed }))}
      />
    </>
  );
};
