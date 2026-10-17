// La liste des clips bruts : une ligne par clip, avec sa date et sa durée. Un clic choisit le clip qui s'ouvre dans le lecteur.

import type { ClipSummary } from "../../domain/clip.schema";
import { ClipRowList } from "./clip-row-list";
import { toClipDateText, toDurationText } from "./clip-text";

type ClipRowsProps = {
  clips: readonly ClipSummary[];
  selectedName: string | null;
  // Un clip est en cours de traitement : on ne change pas de clip sous lui.
  isDisabled?: boolean;
  onSelect: (name: string) => void;
};

export const ClipRows = ({ clips, selectedName, isDisabled = false, onSelect }: ClipRowsProps) => (
  <ClipRowList
    rows={clips.map((clip) => ({
      id: clip.name,
      title: clip.name,
      details: `${toClipDateText(clip.modifiedAt)} · ${toDurationText(clip.duration)}`,
    }))}
    selectedId={selectedName}
    isDisabled={isDisabled}
    onSelect={onSelect}
  />
);
