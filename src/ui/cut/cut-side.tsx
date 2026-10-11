// Les réglages à droite du plateau : la loupe sur la charnière choisie, les lèvres noires (avec leur épaisseur) et la
// fermeture de la bouche.

import type { ImageSize, Lips } from "../../domain/cut.rules";
import type { Cut } from "../../domain/head.types";
import { Checkbox } from "../design/checkbox";
import { Slider, type SliderStep } from "../design/slider";
import type { HingeSide } from "./cut-board";
import { CutLoupe } from "./cut-loupe";

const MAX_CLOSING = 60;
const MAX_THICKNESS = 30;

// De `from` à `max` pixels, un cran par pixel.
const toPixelSteps = (from: number, max: number): SliderStep[] =>
  Array.from({ length: max - from + 1 }, (_, index) => ({
    value: from + index,
    label: `${from + index} px`,
  }));

const CLOSING_STEPS = toPixelSteps(0, MAX_CLOSING);
const THICKNESS_STEPS = toPixelSteps(1, MAX_THICKNESS);

const HINGE_LABELS: Record<HingeSide, string> = { left: "Charnière gauche", right: "Charnière droite" };

// Une valeur entière dans les crans du curseur : celle qu'a devinée la découpe peut les dépasser.
const toLimited = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

type CutSideProps = {
  sourceUrl: string;
  size: ImageSize;
  cut: Cut;
  selected: HingeSide;
  lips: Lips;
  closing: number;
  onLipsChange: (lips: Lips) => void;
  onClosingChange: (closing: number) => void;
};

export const CutSide = ({
  sourceUrl,
  size,
  cut,
  selected,
  lips,
  closing,
  onLipsChange,
  onClosingChange,
}: CutSideProps) => (
  <div className="cut-side">
    <CutLoupe sourceUrl={sourceUrl} size={size} point={cut[selected]} label={HINGE_LABELS[selected]} />
    <Checkbox
      label="Lèvres noires"
      isChecked={lips.isDrawn}
      onToggle={(isDrawn) => onLipsChange({ ...lips, isDrawn })}
    />
    {lips.isDrawn && (
      <Slider
        label="Épaisseur"
        steps={THICKNESS_STEPS}
        value={toLimited(lips.thickness, 1, MAX_THICKNESS)}
        onMove={(thickness) => onLipsChange({ ...lips, thickness })}
        onPick={(thickness) => onLipsChange({ ...lips, thickness })}
      />
    )}
    <Slider
      label="Fermeture"
      steps={CLOSING_STEPS}
      value={toLimited(closing, 0, MAX_CLOSING)}
      onMove={onClosingChange}
      onPick={onClosingChange}
    />
    <p className="lp-type-caption lp-muted">Descend le haut, bouche fermée.</p>
  </div>
);
