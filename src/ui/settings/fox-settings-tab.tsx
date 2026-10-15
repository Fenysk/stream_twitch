// L'onglet « Renard » : l'aperçu en direct et « Faire parler » à gauche, fixes ; à droite, le choix d'un sous-onglet (Voix, Corps,
// Écoute, Évènements, Réactions : fox-sections.ts), puis ses cartes. Le sous-onglet est dans l'adresse, la route le donne.
// Chaque choix s'applique en direct sur la page `/fox` et se garde dans settings.local.json : rien à enregistrer.

import type { FoxSectionId } from "../../domain/fox-section.schema";
import { Button } from "../design/button";
import { useFox } from "../use-fox";
import { FoxCard } from "./fox-cards";
import { FOX_KEYS } from "./fox-fields";
import { FoxPreview } from "./fox-preview";
import { FoxSectionTabs } from "./fox-section-tabs";
import { FOX_SECTIONS } from "./fox-sections";
import { FoxSpeakForm } from "./fox-speak-form";
import { isDefaultTab } from "./settings-changes";
import { SettingsLoading, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { useSettings } from "./use-settings";
import { useVoices } from "./use-voices";

const TITLE = toSectionLabel("fox");

type FoxSettingsTabProps = { sectionId: FoxSectionId; onSelectSection: (id: FoxSectionId) => void };

export const FoxSettingsTab = ({ sectionId, onSelectSection }: FoxSettingsTabProps) => {
  const settings = useSettings();
  const fox = useFox("preview");
  const { voices, error: voicesError } = useVoices();
  const { view } = settings;
  if (!view) return <SettingsLoading title={TITLE} />;
  const { effective } = view;
  if (effective.foxVoice === undefined)
    return (
      <SettingsPage title={TITLE} errors={["Les réglages du renard (fox*) manquent dans settings.json."]} />
    );
  const isDefault = isDefaultTab(FOX_KEYS, settings.drafts, view.local, effective);
  return (
    <SettingsPage
      title={TITLE}
      errors={[...(voicesError ? [voicesError] : []), ...settings.errors.general]}
      preview={
        <>
          <FoxPreview image={fox.image} bodyRef={fox.bodyRef} />
          <FoxSpeakForm isMuted={fox.isMuted} />
        </>
      }
      actions={
        <Button
          label="Revenir aux valeurs par défaut"
          isDisabled={isDefault}
          onPress={() => void settings.reset(FOX_KEYS)}
        />
      }
    >
      <FoxSectionTabs sectionId={sectionId} onSelect={onSelectSection} />
      {FOX_SECTIONS[sectionId].cards.map((title) => (
        <FoxCard key={title} title={title} voices={voices} settings={settings} effective={effective} />
      ))}
    </SettingsPage>
  );
};
