// L'onglet « Tchat » : l'aperçu en direct avec son bouton de test, deux choix (style, animation), quatre curseurs et une case.
// Chaque choix s'applique en direct sur la page /chat et se garde dans settings.local.json : rien à enregistrer.

import { toChatLook } from "../../domain/chat-settings.rules";
import { Checkbox } from "../design/checkbox";
import { DESIGN_TEXTS } from "../design/design-texts";
import { Segmented, type SegmentedOption } from "../design/segmented";
import { ANIMATION_CHOICES, CHAT_SLIDERS, STYLE_CHOICES } from "./chat-fields";
import { ChatPreview } from "./chat-preview";
import { SettingSlider } from "./setting-slider";
import { useSettings } from "./use-settings";

type ChoiceFieldProps<Value extends string> = {
  label: string;
  help: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onSelect: (value: Value) => void;
};

// Un choix exclusif avec son titre et sa phrase d'aide, comme un curseur a le sien.
const ChoiceField = <Value extends string>({
  label,
  help,
  options,
  value,
  onSelect,
}: ChoiceFieldProps<Value>) => (
  <div className="settings-slider">
    <p className="lp-type-body">{label}</p>
    <Segmented label={label} options={options} value={value} onSelect={onSelect} />
    <p className="lp-type-caption lp-muted">{help}</p>
  </div>
);

export const ChatSettingsTab = () => {
  const settings = useSettings();
  const { view } = settings;
  if (!view) return <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>;
  const { effective } = view;
  const look = toChatLook(effective);
  return (
    <div className="settings-tab">
      <div className="head-tab-body">
        <div className="head-preview">
          <ChatPreview />
        </div>
        <div className="head-controls">
          {settings.errors.general.map((message) => (
            <p key={message} role="alert" className="lp-type-body lp-danger">
              {message}
            </p>
          ))}
          <ChoiceField
            label="Style"
            help="Pills : un fond par message. Panneau : un fond pour toute la colonne."
            options={STYLE_CHOICES}
            value={look.style}
            onSelect={(chatStyle) => void settings.change({ chatStyle })}
          />
          {CHAT_SLIDERS.map((spec) => (
            <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
          ))}
          <ChoiceField
            label="Animation d'apparition"
            help="Du bas : il glisse et rebondit un peu."
            options={ANIMATION_CHOICES}
            value={look.animation}
            onSelect={(chatAnimation) => void settings.change({ chatAnimation })}
          />
          <Checkbox
            label="Afficher les commandes et les bots"
            isChecked={look.shouldShowHidden}
            onToggle={(chatShouldShowHidden) => void settings.change({ chatShouldShowHidden })}
          />
        </div>
      </div>
    </div>
  );
};
