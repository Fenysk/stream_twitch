// L'onglet « Renard » : l'aperçu en direct, « Faire parler », le choix de la voix, puis chaque durée et chaque seuil de ses
// comportements (il parle, il est au repos, il cligne, il t'écoute, il réagit, il s'ennuie, il relance, il remercie, il
// sursaute, il bâille, il compare le son, il tient l'heure), leurs heures et listes de phrases, la connexion à Twitch et la
// lecture du tchat. Chaque choix s'applique en direct sur la page `/fox` et se garde dans settings.local.json : rien à
// enregistrer. La mise en page est celle de l'onglet de la tête.

import { Button } from "../design/button";
import { Checkbox } from "../design/checkbox";
import { ChoiceList } from "../design/choice-list";
import { DESIGN_TEXTS } from "../design/design-texts";
import { useFox } from "../use-fox";
import { FOX_GROUPS, FOX_KEYS, FOX_READ_SLIDERS } from "./fox-fields";
import { FoxPreview } from "./fox-preview";
import { FoxSpeakForm } from "./fox-speak-form";
import { LinesField } from "./lines-field";
import { SettingSlider } from "./setting-slider";
import { SettingTime } from "./setting-time";
import { SettingToggle } from "./setting-toggle";
import { isDefaultTab } from "./settings-changes";
import { TwitchBlock } from "./twitch-block";
import { useSettings } from "./use-settings";
import { useTwitch } from "./use-twitch";
import { useVoices } from "./use-voices";

// « Microsoft Claude » se lit « Claude » : le nom de la langue (fr-CA) dit le reste.
const toVoiceLabel = (name: string): string => name.replace(/^Microsoft /, "");

export const FoxSettingsTab = () => {
  const settings = useSettings();
  const fox = useFox("preview");
  const twitch = useTwitch();
  const { voices, error: voicesError } = useVoices();
  const { view } = settings;
  if (!view) return <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>;
  const { effective } = view;
  if (effective.foxVoice === undefined) {
    return (
      <p role="alert" className="lp-type-body lp-danger">
        Les réglages du renard (fox*) manquent dans settings.json.
      </p>
    );
  }
  const isDefault = isDefaultTab(FOX_KEYS, settings.drafts, view.local, effective);
  return (
    <div className="settings-tab">
      <div className="head-tab-body">
        <div className="head-preview">
          <FoxPreview image={fox.image} bodyRef={fox.bodyRef} />
        </div>
        <div className="head-controls">
          <FoxSpeakForm isMuted={fox.isMuted} />
          {voices && (
            <ChoiceList
              label="Voix"
              options={voices.map(({ name, language }) => ({
                value: name,
                label: toVoiceLabel(name),
                note: language,
              }))}
              value={effective.foxVoice}
              onSelect={(foxVoice) => void settings.change({ foxVoice })}
            />
          )}
          {voicesError && (
            <p role="alert" className="lp-type-body lp-danger">
              {voicesError}
            </p>
          )}
          {settings.errors.general.map((message) => (
            <p key={message} role="alert" className="lp-type-body lp-danger">
              {message}
            </p>
          ))}
          {FOX_GROUPS.map(({ title, toggles, sliders, times, lists }) => (
            <section key={title} className="fox-group">
              <h2 className="lp-type-heading">{title}</h2>
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
            </section>
          ))}
          <TwitchBlock
            status={twitch.status}
            error={twitch.error}
            isBusy={twitch.isBusy}
            onDisconnect={() => void twitch.disconnect()}
          />
          <section className="fox-group">
            <h2 className="lp-type-heading">Lecture du tchat</h2>
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
              Jamais lus : les commandes, les bots, les liens, le spam, les emotes, les insultes. Le pseudo
              n'est jamais dit.
            </p>
            {FOX_READ_SLIDERS.map((spec) => (
              <SettingSlider key={spec.key} spec={spec} settings={settings} effective={effective} />
            ))}
          </section>
          <div className="settings-actions">
            <Button
              label="Revenir aux valeurs par défaut"
              isDisabled={isDefault}
              onPress={() => void settings.reset(FOX_KEYS)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
