// L'onglet « Tête South Park » : les vignettes des expressions, l'aperçu en direct, le vumètre du micro, six curseurs, un
// bouton pour revenir aux valeurs par défaut. Chaque choix s'applique en direct sur la page `/head` et se garde dans
// settings.local.json : rien à enregistrer.

import { PHOTO_ID } from "../../domain/expression.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { Slider } from "../design/slider";
import { ExpressionThumbs } from "./expression-thumbs";
import { SLIDERS, type SliderSpec, toNearestStep } from "./head-fields";
import { HeadPreview } from "./head-preview";
import { MicMeter } from "./mic-meter";
import { toChanges } from "./settings-changes";
import { useExpressions } from "./use-expressions";
import { useMicLevel } from "./use-mic-level";
import { type UseSettings, useSettings } from "./use-settings";

type SettingSliderProps = { spec: SliderSpec; settings: UseSettings; effective: EditableSettings };

const SettingSlider = ({ spec, settings, effective }: SettingSliderProps) => {
  const { key } = spec;
  const chosen = key in settings.drafts ? settings.drafts[key] : effective[key];
  const error = settings.errors.byKey[key];
  return (
    <div className="settings-slider">
      <Slider
        label={spec.label}
        steps={spec.steps}
        value={toNearestStep(spec, chosen)}
        onMove={(value) => settings.edit(key, value)}
        onPick={(value) => settings.edit(key, value)}
      />
      <p className="lp-type-caption lp-muted">{spec.help}</p>
      {error && (
        <p role="alert" className="lp-type-caption lp-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export const HeadSettingsTab = () => {
  const settings = useSettings();
  const mic = useMicLevel();
  const { expressions } = useExpressions();
  const { view } = settings;
  if (!view) return <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>;
  const { effective } = view;
  const isDefault =
    Object.keys(view.local).length === 0 &&
    Object.keys(toChanges(settings.drafts, view.local, effective)).length === 0;
  return (
    <div className="settings-tab">
      {expressions && expressions.length > 1 && (
        <ExpressionThumbs
          label="Expression"
          expressions={expressions}
          currentId={effective.expression ?? PHOTO_ID}
          onPick={(id) => void settings.choose(id === PHOTO_ID ? null : id)}
        />
      )}
      <div className="head-tab-body">
        <div className="head-preview">
          <HeadPreview />
        </div>
        <div className="head-controls">
          <MicMeter level={mic.level} isLinked={mic.isLinked} threshold={effective.threshold} />
          {settings.errors.general.map((message) => (
            <p key={message} role="alert" className="lp-type-body lp-danger">
              {message}
            </p>
          ))}
          {SLIDERS.map((spec) => (
            <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
          ))}
          <div className="settings-actions">
            <Button
              label="Revenir aux valeurs par défaut"
              isDisabled={isDefault}
              onPress={() => void settings.reset()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
