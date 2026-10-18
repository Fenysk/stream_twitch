// Sous le lecteur, une fois la durée connue : la timeline (pistes Coupe et Rires), « Lire la sélection », « Rire ici », le volume des rires
// et le rire choisi.

import { Laugh, Play } from "lucide-react";
import type { SoundSummary } from "../../domain/sound.schema";
import type { Trim } from "../../domain/trim.rules";
import { Button } from "../design/button";
import { Slider, type SliderStep } from "../design/slider";
import { toTimecodeText } from "./clip-text";
import { ClipTimeline, TimelineTrack } from "./clip-timeline";
import { LaughPanel } from "./laugh-panel";
import { LaughTrack } from "./laugh-track";
import { TrimBar } from "./trim-bar";
import type { ClipLaughs } from "./use-clip-laughs";

// Le volume des rires : chaque pourcent de 0 à 100, `onMove` à chaque cran franchi pour l'entendre changer pendant que les rires jouent.
const FADER_STEPS: readonly SliderStep[] = Array.from({ length: 101 }, (_, value) => ({
  value,
  label: `${value} %`,
}));

export const NO_SOUND_TEXT = "Aucun sound dans la soundboard : ajoute-en un dans l'onglet Sons.";

type ClipTimelineSectionProps = {
  duration: number;
  trim: Trim;
  // La position de lecture.
  time: number;
  // Le début et la fin ne se changent pas : les poignées sont désactivées.
  isTrimLocked: boolean;
  // Un clip (celui-ci ou un autre) est en cours de traitement : rien ne se change.
  isWorking: boolean;
  laughs: ClipLaughs;
  // Le volume des rires du clip, de 0 à 100.
  laughFader: number;
  sounds: readonly SoundSummary[] | null;
  onSeek: (time: number) => void;
  onLaughFaderChange: (fader: number) => void;
  onStartChange: (time: number) => void;
  onEndChange: (time: number) => void;
  onPlayKept: () => void;
};

export const ClipTimelineSection = ({
  duration,
  trim,
  time,
  isTrimLocked,
  isWorking,
  laughs,
  laughFader,
  sounds,
  onSeek,
  onLaughFaderChange,
  onStartChange,
  onEndChange,
  onPlayKept,
}: ClipTimelineSectionProps) => (
  <>
    <ClipTimeline duration={duration} time={time} onSeek={onSeek}>
      <TimelineTrack name="Coupe">
        <TrimBar
          duration={duration}
          trim={trim}
          time={time}
          isDisabled={isTrimLocked}
          onStartChange={onStartChange}
          onEndChange={onEndChange}
          onSeek={onSeek}
        />
      </TimelineTrack>
      <LaughTrack
        duration={duration}
        blocks={laughs.blocks}
        isDisabled={isWorking}
        onChoose={laughs.choose}
        onMove={laughs.move}
      />
    </ClipTimeline>
    <div className="clip-trim-row">
      <Button label="Lire la sélection" icon={Play} isDisabled={isWorking} onPress={onPlayKept} />
      <Button
        label="Rire ici"
        icon={Laugh}
        isDisabled={isWorking || !laughs.canCreate}
        onPress={laughs.create}
      />
      <p className="lp-type-numeric">
        {isTrimLocked
          ? `Durée ${toTimecodeText(trim.end - trim.start)}`
          : `Début ${toTimecodeText(trim.start)} · Fin ${toTimecodeText(trim.end)} · Gardé ${toTimecodeText(trim.end - trim.start)}`}
      </p>
    </div>
    <div className="laugh-fader">
      <Slider
        label="Volume des rires"
        steps={FADER_STEPS}
        value={laughFader}
        onPick={onLaughFaderChange}
        onMove={onLaughFaderChange}
        isDisabled={isWorking}
      />
    </div>
    {laughs.isSoundboardEmpty && <p className="lp-type-body lp-muted">{NO_SOUND_TEXT}</p>}
    {laughs.details && (
      <LaughPanel
        details={laughs.details}
        sounds={sounds}
        isDisabled={isWorking}
        onUpdate={laughs.update}
        onDelete={laughs.delete}
      />
    )}
  </>
);
