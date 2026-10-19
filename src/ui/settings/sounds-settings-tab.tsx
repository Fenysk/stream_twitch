// L'onglet « Sons » : les sounds de la soundboard, réglés à part des récompenses de points de chaîne, en deux cartes sur la page
// commune (Sons, Ajouter un son), une seule colonne. On ajoute un sound (fichier, titre, volume), on l'écoute dans cette page, on
// le joue dans OBS (page /sounds), on le modifie ou on le supprime ; « Couper le son » arrête le sound en cours dans OBS et vide la
// queue. Aucune de ces actions ne parle à Twitch.

import { VolumeX } from "lucide-react";
import { useState } from "react";
import type { SoundInput, SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { createSound, deleteSound, playSound, stopSounds, updateSound } from "../sounds-api";
import { SettingsCard, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { SoundForm } from "./sound-form";
import { SoundRow } from "./sound-row";
import { useSoundPreview } from "./use-sound-preview";
import { useSounds } from "./use-sounds";

const TITLE = toSectionLabel("sounds");

// Ce que l'onglet dit après une action : une confirmation, ou le refus.
type Notice = { text: string; isError: boolean };

export const SoundsSettingsTab = () => {
  const { sounds, refresh } = useSounds();
  const preview = useSoundPreview();
  const [editedId, setEditedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const say = (text: string) => setNotice({ text, isError: false });
  const refuse = (text: string) => setNotice({ text, isError: true });

  const create = async (input: SoundInput): Promise<string | null> => {
    const answer = await createSound(input);
    if (!answer.ok) return answer.message;
    await refresh();
    say(`« ${answer.value.title} » est ajouté.`);
    return null;
  };

  const update = async (id: string, input: SoundInput): Promise<string | null> => {
    const answer = await updateSound(id, input);
    if (!answer.ok) return answer.message;
    setEditedId(null);
    await refresh();
    say(`« ${answer.value.title} » est enregistré.`);
    return null;
  };

  const deleteOne = async (sound: SoundSummary) => {
    setIsBusy(true);
    const answer = await deleteSound(sound.id);
    setIsBusy(false);
    if (!answer.ok) {
      refuse(answer.message);
      return;
    }
    await refresh();
    say(`« ${sound.title} » est supprimé.`);
  };

  const playInObs = async (sound: SoundSummary) => {
    const answer = await playSound(sound.id);
    if (answer.ok) say(`« ${sound.title} » part dans OBS.`);
    else refuse(answer.message);
  };

  const stop = async () => {
    const answer = await stopSounds();
    if (answer.ok) say("Le son s'arrête dans OBS, la file est vide.");
    else refuse(answer.message);
  };

  return (
    <SettingsPage title={TITLE}>
      <SettingsCard title="Sons">
        <div className="sound-global">
          <Button label="Couper le son" icon={VolumeX} variant="danger" onPress={() => void stop()} />
        </div>
        <p className="lp-type-caption lp-muted">
          Un son est un fichier audio avec un titre et un volume. Il se joue dans la source navigateur OBS
          /sounds (taille libre, aucune image), l'un après l'autre. Laisse « Contrôler l'audio via OBS »
          décochée : le son sort par Windows, et OBS le capte une fois par « Audio PC ».
        </p>
        {notice && (
          <p
            role={notice.isError ? "alert" : "status"}
            className={notice.isError ? "lp-type-body lp-danger" : "lp-type-body"}
          >
            {notice.text}
          </p>
        )}
        {preview.error && (
          <p role="alert" className="lp-type-body lp-danger">
            {preview.error}
          </p>
        )}
        {sounds === null && <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>}
        {sounds?.length === 0 && <p className="lp-type-body lp-muted">Aucun son pour l'instant.</p>}
        {sounds && sounds.length > 0 && (
          <ul className="sound-list" aria-label="Sons">
            {sounds.map((sound) =>
              sound.id === editedId ? (
                <li key={sound.id} className="sound-row">
                  <SoundForm
                    initial={sound}
                    onSubmit={(input) => update(sound.id, input)}
                    onCancel={() => setEditedId(null)}
                  />
                </li>
              ) : (
                <SoundRow
                  key={sound.id}
                  sound={sound}
                  isPlaying={preview.playingId === sound.id}
                  isBusy={isBusy}
                  onPreview={() => preview.toggle(sound)}
                  onPlay={() => void playInObs(sound)}
                  onEdit={() => setEditedId(sound.id)}
                  onDelete={() => void deleteOne(sound)}
                />
              ),
            )}
          </ul>
        )}
      </SettingsCard>
      <SettingsCard title="Ajouter un son">
        <SoundForm initial={null} onSubmit={create} />
      </SettingsCard>
    </SettingsPage>
  );
};
