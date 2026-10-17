// Sous la timeline, le rire choisi : son rang et son instant, le choix de son sound, ce qui l'empêche d'être joué, et « Retirer ».

import { Eraser } from "lucide-react";
import type { SoundSummary } from "../../domain/sound.schema";
import { Button } from "../design/button";
import type { LaughDetails } from "./clip-laughs";
import { toLaughRankText } from "./clip-text";
import { LaughChoice } from "./laugh-choice";

export const OVER_END_TEXT = "Dépasse la fin : la dernière image attend.";
export const NOT_KEPT_TEXT = "Hors de la partie gardée : il ne sera pas joué.";

type LaughPanelProps = {
  details: LaughDetails;
  sounds: readonly SoundSummary[] | null;
  // Un clip est en cours de traitement : rien ne se change.
  isDisabled: boolean;
  onUpdate: (sound: string) => void;
  onDelete: () => void;
};

export const LaughPanel = ({ details, sounds, isDisabled, onUpdate, onDelete }: LaughPanelProps) => (
  <div className="laugh-panel">
    <p className="lp-type-numeric">{toLaughRankText(details.rank, details.count, details.at)}</p>
    <LaughChoice sounds={sounds} value={details.sound} isDisabled={isDisabled} onSelect={onUpdate} />
    {details.isOverEnd && (
      <p role="status" className="lp-type-body lp-warning">
        {OVER_END_TEXT}
      </p>
    )}
    {!details.isKept && (
      <p role="status" className="lp-type-body lp-warning">
        {NOT_KEPT_TEXT}
      </p>
    )}
    <div>
      <Button label="Retirer" icon={Eraser} isDisabled={isDisabled} onPress={onDelete} />
    </div>
  </div>
);
