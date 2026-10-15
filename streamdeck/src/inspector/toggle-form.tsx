import {
  DECK_TOGGLE_SETTINGS,
  type DeckToggleSetting,
  DeckToggleSettingSchema,
} from "../../../src/domain/deck.schema";
import { ChoiceList } from "../../../src/ui/design/choice-list";
import { toSettingLabel } from "../deck-catalogue";
import type { CatalogueState } from "./catalogue-state";
import { toDraftName } from "./draft";
import { KeyNameField } from "./key-name-field";

// Une touche qu'on vient de poser n'a pas encore de réglage : le formulaire garde ce qui est choisi, le reste attend.
type ToggleDraft = { setting?: DeckToggleSetting; name: string };

type ToggleFormProps = {
  settings: Record<string, unknown>;
  catalogue: CatalogueState;
  onChange: (settings: ToggleDraft) => void;
};

// L'état du serveur, sous le libellé du réglage, quand le plugin a pu le lire.
const toNote = (catalogue: CatalogueState, setting: string): string | undefined => {
  if (catalogue.status !== "ready") return undefined;
  return catalogue.values[setting] === true ? "Activé en ce moment" : "Désactivé en ce moment";
};

export const ToggleForm = ({ settings, catalogue, onChange }: ToggleFormProps) => {
  const parsed = DeckToggleSettingSchema.safeParse(settings.setting);
  const setting = parsed.success ? parsed.data : undefined;
  const name = toDraftName(settings);
  const draft = (next: Partial<ToggleDraft>): ToggleDraft => ({ ...(setting && { setting }), name, ...next });
  return (
    <>
      <ChoiceList
        label="Réglage à basculer"
        options={DECK_TOGGLE_SETTINGS.map((option) => {
          const note = toNote(catalogue, option);
          return { value: option, label: toSettingLabel(option), ...(note === undefined ? {} : { note }) };
        })}
        value={setting ?? null}
        onSelect={(chosen) => onChange(draft({ setting: chosen }))}
      />
      <KeyNameField
        value={name}
        placeholder={setting ? toSettingLabel(setting) : ""}
        onInput={(typed) => onChange(draft({ name: typed }))}
      />
    </>
  );
};
