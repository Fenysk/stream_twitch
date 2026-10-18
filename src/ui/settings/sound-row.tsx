// Un sound de la liste : son titre, son volume, qui l'utilise, et ses boutons. « Écouter » joue dans cette page, « Jouer dans OBS »
// envoie le sound à la page /sounds. Supprimer demande une confirmation, qui redit qui perdra ce sound.

import { MonitorPlay, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import { toDeletionText, toUsageText } from "./sound-text";

type SoundRowProps = {
  sound: SoundSummary;
  // On écoute ce sound dans cette page.
  isPlaying: boolean;
  isBusy: boolean;
  onPreview: () => void;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export const SoundRow = ({
  sound,
  isPlaying,
  isBusy,
  onPreview,
  onPlay,
  onEdit,
  onDelete,
}: SoundRowProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const deletion = toDeletionText(sound);
  return (
    <li className="sound-row">
      <div className="sound-summary">
        <p className="lp-type-body">{sound.title}</p>
        <p className="lp-type-caption lp-muted">volume {sound.fader} %</p>
        <p className="lp-type-caption lp-muted">{toUsageText(sound)}</p>
        {isConfirming && deletion && (
          <p role="alert" className="lp-type-caption lp-warning">
            {deletion}
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
