import { toPresetBinding } from "../../../src/domain/deck.rules";
import { DECK_SETTINGS, type PresetPair } from "../../../src/domain/deck.schema";
import { Checkbox } from "../../../src/ui/design/checkbox";
import { TextField } from "../../../src/ui/design/text-field";
import { DEFAULT_PRESET_NAME, toSettingLabel } from "../deck-catalogue";
import type { CatalogueState } from "./catalogue-state";
import { toDraftName, toExpressions } from "./draft";
import { PairValue } from "./pair-value";
import { toInitialValue, toUpdatedPairs } from "./preset-pairs";

type PresetDraft = { name: string; pairs: PresetPair[] };

type PresetFormProps = {
  settings: Record<string, unknown>;
  catalogue: CatalogueState;
  onChange: (settings: PresetDraft) => void;
};

export const PresetForm = ({ settings, catalogue, onChange }: PresetFormProps) => {
  const pairs = toPresetBinding(settings)?.pairs ?? [];
  const name = toDraftName(settings);
  const expressions = toExpressions(catalogue);
  return (
    <>
      <TextField
        label="Nom du préréglage"
        value={name}
        placeholder={DEFAULT_PRESET_NAME}
        maxLength={40}
        onInput={(typed) => onChange({ name: typed, pairs })}
      />
      <fieldset className="inspector-values">
        <legend className="lp-type-body">Réglages que le préréglage change</legend>
        {DECK_SETTINGS.map((setting) => {
          const pair = pairs.find((candidate) => candidate.setting === setting);
          const initial = toInitialValue(setting, catalogue, expressions);
          return (
            <div key={setting} className="inspector-pair">
              <Checkbox
                label={toSettingLabel(setting)}
                isChecked={pair !== undefined}
                isDisabled={pair === undefined && initial === undefined}
                onToggle={(isChecked) =>
                  onChange({
                    name,
                    pairs: toUpdatedPairs(
                      pairs,
                      setting,
                      isChecked && initial !== undefined ? { setting, value: initial } : undefined,
                    ),
                  })
                }
              />
              {pair && (
                <PairValue
                  setting={setting}
                  value={pair.value}
                  expressions={expressions}
                  onChange={(value) =>
                    onChange({ name, pairs: toUpdatedPairs(pairs, setting, { setting, value }) })
                  }
                />
              )}
            </div>
          );
        })}
      </fieldset>
    </>
  );
};
