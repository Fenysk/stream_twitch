// Un réglage à curseur d'un onglet : le curseur, sa phrase d'aide dessous, et le refus du serveur s'il y en a un.

import type { EditableSettings } from "../../domain/settings.schema";
import { Slider } from "../design/slider";
import { type SliderSpec, toNearestStep } from "./head-fields";
import type { UseSettings } from "./use-settings";

type SettingSliderProps = { spec: SliderSpec; settings: UseSettings; effective: EditableSettings };

// La valeur que montre le curseur : le geste en cours (brouillon), sinon le réglage appliqué, calée sur un cran.
export const toSliderValue = (
  spec: SliderSpec,
  { drafts }: UseSettings,
  effective: EditableSettings,
): number => toNearestStep(spec, spec.key in drafts ? drafts[spec.key] : effective[spec.key]);

export const SettingSlider = ({ spec, settings, effective }: SettingSliderProps) => {
  const { key } = spec;
  const error = settings.errors.byKey[key];
  return (
    <div className="settings-slider">
      <Slider
        label={spec.label}
        steps={spec.steps}
        value={toSliderValue(spec, settings, effective)}
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
