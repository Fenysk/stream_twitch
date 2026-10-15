// L'onglet « Points de chaîne » : les sons de la soundboard, en trois cartes sur la page commune (Sons, Ajouter un son, Phrases
// de Jean-Renard), une seule colonne. On ajoute un son (fichier, titre, coût, cooldown, volume) : l'app
// crée sa récompense sur Twitch ; on l'écoute dans cette page, on le joue dans OBS (page /sounds), on le modifie ou on le
// supprime (sa récompense suit) ; « Couper le son » arrête le son en cours dans OBS et vide la queue. Les refus de Twitch
// (chaîne non affiliée, titre pris, 50 récompenses) se lisent tels quels. Dessous, chaque récompense de la chaîne peut recevoir
// des phrases de Jean-Renard, avec ou sans son.

import { RefreshCw, VolumeX } from "lucide-react";
import { useState } from "react";
import type { SoundInput, SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { createSound, deleteSound, playSound, stopSounds, updateSound } from "../sounds-api";
import { RewardPhrasesSection } from "./reward-phrases-section";
import { SettingsCard, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { SoundForm } from "./sound-form";
import { SoundRow } from "./sound-row";
import { toTwitchHint } from "./twitch-hint";
import { useRewardChoices } from "./use-reward-choices";
import { useRewardPhrases } from "./use-reward-phrases";
import { useSoundPreview } from "./use-sound-preview";
import { useSounds } from "./use-sounds";
import { useTwitch } from "./use-twitch";

const TITLE = toSectionLabel("rewards");

// Ce que l'onglet dit après une action : une confirmation, ou le refus.
type Notice = { text: string; isError: boolean };

export const RewardsSettingsTab = () => {
  const { sounds, refresh } = useSounds();
  const preview = useSoundPreview();
  const twitchHint = toTwitchHint(useTwitch().status);
  const twitchRewards = useRewardChoices();
  const rewardPhrases = useRewardPhrases();
  // Ce que la liste de Twitch donne au formulaire : `null` quand Twitch ne l'a pas donnée.
  const choices = twitchRewards.rewards?.choices ?? null;
  const missing = new Set(twitchRewards.rewards?.missing);
  const [editedId, setEditedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const say = (text: string) => setNotice({ text, isError: false });
  const refuse = (text: string) => setNotice({ text, isError: true });

  const create = async (input: SoundInput): Promise<string | null> => {
    const answer = await createSound(input);
    if (!answer.ok) return answer.message;
    await refresh();
    say(`« ${answer.value.title} » est ajouté, sa récompense existe sur Twitch.`);
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
    say(`« ${sound.title} » est supprimé, sa récompense aussi.`);
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
          Chaque son a sa récompense de points de chaîne, créée par l'application sur Twitch : la modifier ou
          la supprimer ici suit sur Twitch. Un viewer qui la dépense lance le son dans la source navigateur
          OBS /sounds (taille libre, aucune image), l'un après l'autre : ses points sont gardés si le son joue
          jusqu'au bout, rendus sinon. Coche « Contrôler l'audio via OBS » pour régler les sons dans le
          mélangeur.
        </p>
        <div className="sound-global">
          <Button
            label="Rafraîchir"
            icon={RefreshCw}
            isDisabled={twitchRewards.isLoading || rewardPhrases.isLoading}
            onPress={() => void Promise.all([twitchRewards.refresh(), rewardPhrases.refresh()])}
          />
          <p className="lp-type-caption lp-muted">
            {twitchRewards.rewards
              ? `${twitchRewards.rewards.choices.length} récompense(s) de la chaîne sans son.`
              : "Les récompenses de la chaîne se lisent sur Twitch."}
          </p>
        </div>
        {twitchRewards.error && (
          <p role="status" className="lp-type-caption lp-muted">
            {twitchRewards.error}
          </p>
        )}
        {twitchHint && (
          <p role="status" className="lp-type-body lp-warning">
            {twitchHint}
          </p>
        )}
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
                    choices={choices}
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
                  isMissing={missing.has(sound.id)}
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
        <SoundForm initial={null} choices={choices} onSubmit={create} />
      </SettingsCard>
      <RewardPhrasesSection phrases={rewardPhrases} />
    </SettingsPage>
  );
};
