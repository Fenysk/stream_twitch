// L'onglet « Tête South Park » : l'aperçu en direct à gauche ; à droite, les vignettes des expressions, puis le vumètre du micro
// et six curseurs ; en haut, un bouton pour revenir aux valeurs par défaut. Chaque choix s'applique en direct sur la page
// `/head` et se garde dans settings.local.json : rien à enregistrer.

import { Button } from "../design/button";
import { ExpressionCard } from "./expression-card";
import { SLIDER_KEYS, SLIDERS } from "./head-fields";
import { HeadPreview } from "./head-preview";
import { MicMeter } from "./mic-meter";
import { SettingSlider } from "./setting-slider";
import { isDefaultTab } from "./settings-changes";
import { SettingsCard, SettingsLoading, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { useExpressions } from "./use-expressions";
import { useMicLevel } from "./use-mic-level";
import { useSettings } from "./use-settings";

// Les réglages de cet onglet : revenir aux valeurs par défaut ne touche pas à ceux du tchat ni du renard.
const HEAD_KEYS = [...SLIDER_KEYS, "expression"];

const TITLE = toSectionLabel("head");

export const HeadSettingsTab = () => {
  const settings = useSettings();
  const mic = useMicLevel();
  const { expressions } = useExpressions();
  const { view } = settings;
  if (!view) return <SettingsLoading title={TITLE} />;
  const { effective } = view;
  const isDefault = isDefaultTab(HEAD_KEYS, settings.drafts, view.local, effective);
  return (
    <SettingsPage
      title={TITLE}
      errors={settings.errors.general}
      preview={<HeadPreview />}
      actions={
        <Button
          label="Revenir aux valeurs par défaut"
          isDisabled={isDefault}
          onPress={() => void settings.reset(HEAD_KEYS)}
        />
      }
    >
      <ExpressionCard
        title="Expression"
        expressions={expressions}
        settings={settings}
        effective={effective}
      />
      <SettingsCard title="Micro et mouvements">
        <MicMeter level={mic.level} isLinked={mic.isLinked} threshold={effective.threshold} />
        {SLIDERS.map((spec) => (
          <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
        ))}
      </SettingsCard>
    </SettingsPage>
  );
};
