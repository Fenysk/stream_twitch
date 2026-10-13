// Un réglage à case d'un onglet : la case, sa phrase d'aide dessous, et le refus du serveur s'il y en a un.

import type { EditableSettings } from "../../domain/settings.schema";
import { Checkbox } from "../design/checkbox";
import type { ToggleSpec } from "./head-fields";
import type { UseSettings } from "./use-settings";

type SettingToggleProps = { spec: ToggleSpec; settings: UseSettings; effective: EditableSettings };

export const SettingToggle = ({ spec, settings, effective }: SettingToggleProps) => {
  const error = settings.errors.byKey[spec.key];
  return (
    <div className="settings-toggle">
      <Checkbox
        label={spec.label}
        isChecked={effective[spec.key] ?? spec.fallback}
        onToggle={(isChecked) => void settings.change({ [spec.key]: isChecked })}
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
