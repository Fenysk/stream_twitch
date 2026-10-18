// L'onglet « Émission » : l'adresse de la source OBS qui passe les clips confirmés, où en est l'émission (arrêtée, ou « clip 2 sur 5 »),
// combien de clips elle passe et les phrases de Jean-Renard au début et à la fin, puis deux listes. Les clips bruts du dossier d'OBS
// (le tampon de relecture), du plus récent au plus ancien : un clic les ouvre dans l'éditeur, où l'on choisit le début et la fin, un
// titre et la phrase de Jean-Renard, puis on valide (le clip est recodé dans Confirmés) ou on jette. Les clips de l'émission (les
// confirmés) : un clic les ouvre dans le même éditeur, rempli, pour les modifier ou les retirer de l'émission.

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toConfirmedText } from "../clips/clip-text";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { SettingsCard, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { EditorCard, ListCards, type Selection } from "./show-clip-cards";
import { EpisodeCards } from "./show-episode-cards";
import { useClips } from "./use-clips";
import { useSettings } from "./use-settings";
import { useShowState } from "./use-show-state";
import { useSounds } from "./use-sounds";

// L'adresse de la page, lue après l'affichage : le serveur ne la connaît pas (rendu serveur sans fenêtre).
const useOrigin = (): string => {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
};

export const ShowSettingsTab = () => {
  const clips = useClips();
  const settings = useSettings();
  const showState = useShowState();
  const { sounds } = useSounds();
  const { list, error, isWorking, refresh } = clips;
  const origin = useOrigin();
  const [selection, setSelection] = useState<Selection | null>(null);
  // Ce que dit la dernière action : un clip confirmé, jeté, enregistré ou retiré.
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <SettingsPage
      title={toSectionLabel("show")}
      errors={error ? [error] : []}
      actions={
        <Button label="Actualiser" icon={RefreshCw} isDisabled={isWorking} onPress={() => void refresh()} />
      }
    >
      <SettingsCard title="Source OBS">
        <p className="lp-type-body">
          Source navigateur de 1920 × 1080 : <code className="show-address">{origin}/show</code>
        </p>
        <p className="lp-type-body lp-muted">
          {list ? toConfirmedText(list.confirmedCount) : DESIGN_TEXTS.loading}
        </p>
      </SettingsCard>
      <EpisodeCards state={showState} settings={settings} confirmed={list?.confirmed ?? null} />
      {notice && (
        <p role="status" className="settings-card lp-type-body">
          {notice}
        </p>
      )}
      <EditorCard
        selection={selection}
        list={list}
        sounds={sounds}
        clips={clips}
        onDone={(text) => {
          setSelection(null);
          setNotice(text);
        }}
      />
      <ListCards
        list={list}
        error={error}
        selection={selection}
        isWorking={isWorking}
        onSelect={(kind, name) => {
          setSelection({ kind, name });
          setNotice(null);
        }}
      />
    </SettingsPage>
  );
};
