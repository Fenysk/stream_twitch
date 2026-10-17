// La liste « Clips de l'émission » : un clip confirmé par ligne, avec son titre, sa durée et sa date de validation. Un clic l'ouvre
// dans l'éditeur.

import type { ConfirmedSummary } from "../../domain/clip.schema";
import { ClipRowList } from "./clip-row-list";
import { toClipDateText, toDurationText } from "./clip-text";

type ConfirmedRowsProps = {
  clips: readonly ConfirmedSummary[];
  selectedName: string | null;
  isDisabled?: boolean;
  onSelect: (name: string) => void;
};

export const ConfirmedRows = ({ clips, selectedName, isDisabled = false, onSelect }: ConfirmedRowsProps) => (
  <ClipRowList
    rows={clips.map((clip) => ({
      id: clip.name,
      title: clip.title,
      details: `${toDurationText(clip.end - clip.start)} · validé le ${toClipDateText(Date.parse(clip.confirmedAt))}`,
    }))}
    selectedId={selectedName}
    isDisabled={isDisabled}
    onSelect={onSelect}
  />
);
