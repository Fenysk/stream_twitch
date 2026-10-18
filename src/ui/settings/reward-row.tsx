// Une récompense de la chaîne : son titre, son coût et son cooldown, qui l'a créée, le menu de son sound, ses phrases de
// Jean-Renard. Celle que l'application a créée se modifie et se supprime (la suppression demande une confirmation : le bouton change
// de libellé au premier clic) ; celle qu'Alexis a faite sur Twitch se règle sur Twitch, l'app n'en change que le sound et les phrases.

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { RewardSummary } from "../../domain/reward.schema";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { Menu } from "../design/menu";
import { RewardPhrasesRow } from "./reward-phrases-row";
import { toSoundChoices } from "./reward-sound-choices";
import { toPaceText } from "./reward-text";

const MANAGED_NOTE = "Points rendus si le son ne joue pas";
const TWITCH_NOTE = "Se règle sur Twitch. Points non rendus si le son ne joue pas.";

type RewardRowProps = {
  reward: RewardSummary;
  // Ses phrases ; `null` : la liste des phrases n'est pas lue.
  phrases: RewardPhrasesEntry | null;
  // Les sounds du menu ; `null` : la liste n'est pas lue.
  sounds: readonly SoundSummary[] | null;
  isBusy: boolean;
  // Rendent le refus à montrer, ou `null` quand c'est fait.
  onPickSound: (rewardId: string, sound: string | null) => Promise<string | null>;
  onSavePhrases: (id: string, phrases: string[]) => Promise<string | null>;
  onTestPhrases: (id: string) => Promise<string | null>;
  onEdit: () => void;
  onDelete: () => void;
};

// Qui a créé la récompense, ou ce qu'elle est devenue (l'infobulle de son badge dit le reste).
const RewardBadges = ({ reward }: { reward: RewardSummary }) =>
  reward.isMissing ? (
    <Badge
      label="N'existe plus sur Twitch"
      title="Cette récompense n'existe plus sur Twitch : elle reste ici, sans rachat possible, jusqu'à ce que son sound et ses phrases soient retirés."
    />
  ) : reward.isManaged ? (
    <Badge
      label="Créée par l'application"
      title="L'application l'a créée : elle la modifie, la supprime, la met en pause hors stream et marque ses rachats."
    />
  ) : (
    <Badge
      label="Faite sur Twitch"
      title="Alexis l'a faite sur Twitch : l'application la lit, elle n'en change que le sound et les phrases."
    />
  );

export const RewardRow = ({
  reward,
  phrases,
  sounds,
  isBusy,
  onPickSound,
  onSavePhrases,
  onTestPhrases,
  onEdit,
  onDelete,
}: RewardRowProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (value: string) => setError(await onPickSound(reward.id, value === "" ? null : value));

  return (
    <li className="sound-row">
      <div className="sound-summary">
        <p className="lp-type-body">
          {reward.title} <RewardBadges reward={reward} />
        </p>
        {!reward.isMissing && (
          <>
            <p className="lp-type-caption lp-muted">
              {reward.cost} points · {toPaceText(reward.pace)}
            </p>
            <p className="lp-type-caption lp-muted">{reward.isManaged ? MANAGED_NOTE : TWITCH_NOTE}</p>
          </>
        )}
      </div>
      <div className="sound-pick">
        <Menu
          label="Son"
          choices={toSoundChoices(sounds)}
          value={reward.sound ?? ""}
          isDisabled={isBusy || sounds === null}
          onSelect={(value) => void pick(value)}
        />
      </div>
      {error && (
        <p role="alert" className="lp-type-caption lp-danger">
          {error}
        </p>
      )}
      {reward.isManaged && (
        <div className="sound-buttons">
          {!reward.isMissing && (
            <Button title="Modifier" icon={Pencil} isDisabled={isBusy} onPress={onEdit} />
          )}
          {isConfirming ? (
            <>
              <Button
                label="Supprimer pour de bon"
                variant="danger"
                isDisabled={isBusy}
                onPress={() => {
                  setIsConfirming(false);
                  onDelete();
                }}
              />
              <Button label="Annuler" onPress={() => setIsConfirming(false)} />
            </>
          ) : (
            <Button
              title="Supprimer"
              icon={Trash2}
              variant="danger"
              isDisabled={isBusy}
              onPress={() => setIsConfirming(true)}
            />
          )}
        </div>
      )}
      {isConfirming && (
        <p role="alert" className="lp-type-caption lp-warning">
          La récompense disparaît aussi de Twitch, ses phrases avec elle ; son sound reste dans l'onglet Sons.
        </p>
      )}
      {phrases && <RewardPhrasesRow entry={phrases} onSave={onSavePhrases} onTest={onTestPhrases} />}
    </li>
  );
};
