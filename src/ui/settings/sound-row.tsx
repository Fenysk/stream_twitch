// Un son de la liste : son titre, ses réglages en une ligne, et ses boutons. « Écouter » joue dans cette page, « Jouer dans
// OBS » envoie le son à la page /sounds. Supprimer demande une confirmation : le bouton change de libellé au premier clic.

import { MonitorPlay, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SoundSummary } from "../../domain/sound.schema";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { toPaceText } from "./sound-text";

type SoundRowProps = {
  sound: SoundSummary;
  // On écoute ce son dans cette page.
  isPlaying: boolean;
  isBusy: boolean;
  // Twitch ne connaît plus la récompense du son (supprimée à la main) : le son reste, badgé.
  isMissing: boolean;
  onPreview: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

// Pourquoi le son n'est pas sur Twitch (l'infobulle du badge), ou `null` : il y est.
const toBadge = ({ hasReward }: SoundSummary, isMissing: boolean): string | null => {
  if (!hasReward)
    return "Ce son n'a pas encore de récompense sur Twitch : enregistre-le une fois connecté pour la créer.";
  return isMissing ? "Cette récompense n'existe plus sur Twitch : le son reste, sans rachat possible." : null;
};

export const SoundRow = ({
  sound,
  isPlaying,
  isBusy,
  isMissing,
  onPreview,
  onPlay,
  onEdit,
  onDelete,
}: SoundRowProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const badge = toBadge(sound, isMissing);
  return (
    <li className="sound-row">
      <div className="sound-summary">
        <p className="lp-type-body">
          {sound.title}
          {badge && (
            <>
              {" "}
              <Badge label="Pas sur Twitch" title={badge} />
            </>
          )}
        </p>
        <p className="lp-type-caption lp-muted">
          {sound.cost} points · {toPaceText(sound.pace)} · volume {sound.fader} %
        </p>
        {!sound.isManaged && (
          <p className="lp-type-caption lp-muted">
            Se règle sur Twitch. Points non rendus si le son ne joue pas.
          </p>
        )}
      </div>
      <div className="sound-buttons">
        <Button
          label={isPlaying ? "Arrêter" : "Écouter"}
          icon={isPlaying ? Square : Play}
          onPress={onPreview}
        />
        <Button label="Jouer dans OBS" icon={MonitorPlay} onPress={onPlay} />
        <Button title="Modifier" icon={Pencil} isDisabled={isBusy} onPress={onEdit} />
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
    </li>
  );
};
