// Les cartes de l'onglet « Renard » : une par groupe de FOX_GROUPS, plus la voix et la lecture du tchat, écrites à la main.
// Un sous-onglet les demande par leur titre (fox-sections.ts).

import type { EditableSettings } from "../../domain/settings.schema";
import type { Voice } from "../../domain/voice.schema";
import { Checkbox } from "../design/checkbox";
import { ChoiceList } from "../design/choice-list";
import { FOX_GROUPS, FOX_READ_LISTS, FOX_READ_SLIDERS, type FoxGroup } from "./fox-fields";
import { CHAT_READING_CARD, VOICE_CARD } from "./fox-sections";
import { LinesField } from "./lines-field";
import { SettingSlider } from "./setting-slider";
import { SettingTime } from "./setting-time";
import { SettingToggle } from "./setting-toggle";
import { SettingsCard } from "./settings-page";
import type { UseSettings } from "./use-settings";

type FieldsProps = { settings: UseSettings; effective: EditableSettings };

// « Microsoft Claude » se lit « Claude » : le nom de la langue (fr-CA) dit le reste.
const toVoiceLabel = (name: string): string => name.replace(/^Microsoft /, "");

type VoiceCardProps = FieldsProps & { voices: readonly Voice[] };

const VoiceCard = ({ voices, settings, effective }: VoiceCardProps) => (
  <SettingsCard title={VOICE_CARD}>
    <ChoiceList
      label="Voix de synthèse"
      options={voices.map(({ name, language }) => ({
        value: name,
        label: toVoiceLabel(name),
        note: language,
      }))}
      value={effective.foxVoice ?? null}
      onSelect={(foxVoice) => void settings.change({ foxVoice })}
    />
  </SettingsCard>
);

const ChatReadingCard = ({ settings, effective }: FieldsProps) => (
  <SettingsCard title={CHAT_READING_CARD}>
    <Checkbox
      label="Lire le tchat"
      isChecked={effective.foxShouldReadChat ?? true}
      onToggle={(foxShouldReadChat) => void settings.change({ foxShouldReadChat })}
    />
    <Checkbox
      label="Lire mes messages"
      isChecked={effective.foxShouldReadOwn ?? true}
      onToggle={(foxShouldReadOwn) => void settings.change({ foxShouldReadOwn })}
    />
    <p className="lp-type-caption lp-muted">
      Jamais lus : les commandes, les bots, les liens, le spam, les emotes, les insultes. Le pseudo n'est
      jamais dit.
    </p>
    {FOX_READ_SLIDERS.map((spec) => (
      <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
    {FOX_READ_LISTS.map((spec) => (
      <LinesField key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
  </SettingsCard>
);

const GroupCard = ({
  title,
  toggles,
  sliders,
  times,
  lists,
  settings,
  effective,
}: FoxGroup & FieldsProps) => (
  <SettingsCard title={title}>
    {toggles?.map((spec) => (
      <SettingToggle key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
    {sliders.map((spec) => (
      <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
    {times?.map((spec) => (
      <SettingTime key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
    {lists?.map((spec) => (
      <LinesField key={spec.key} spec={spec} settings={settings} effective={effective} />
    ))}
  </SettingsCard>
);

type FoxCardProps = FieldsProps & { title: string; voices: readonly Voice[] | null };

// La carte qui porte ce titre. Aucune pour un titre inconnu (fox-sections.test.ts l'en empêche), ni pour la voix tant que la
// liste des voix n'est pas lue.
export const FoxCard = ({ title, voices, settings, effective }: FoxCardProps) => {
  if (title === VOICE_CARD)
    return voices ? <VoiceCard voices={voices} settings={settings} effective={effective} /> : null;
  if (title === CHAT_READING_CARD) return <ChatReadingCard settings={settings} effective={effective} />;
  const group = FOX_GROUPS.find((candidate) => candidate.title === title);
  return group ? <GroupCard {...group} settings={settings} effective={effective} /> : null;
};
