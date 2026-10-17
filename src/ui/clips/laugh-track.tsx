// La piste Rires : un bloc par rire (bord gauche à son instant, largeur = durée de son sound, libellé = son titre). Un clic le choisit, le
// glisser ou ←/→ (Maj : 1 s) le déplace, estompé hors de la partie gardée. Calage sur les images et bornes : ceux de l'appelant (`onMove`).

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { STEP_SECONDS, toFraction, toTimeAt } from "../../domain/trim.rules";
import { classNames } from "../design/class-names";
import type { LaughBlock } from "./clip-laughs";
import { toTimecodeText } from "./clip-text";
import { TimelineLane, TimelineTrack, toPercent } from "./clip-timeline";

// Un bloc ne devient jamais plus étroit que ça, même tant que la durée de son sound n'est pas lue.
const MIN_WIDTH_PX = 8;

const KEY_STEP_SECONDS = 1;
const KEY_DIRECTIONS = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

type Bar = { left: number; width: number };

type LaughBlockButtonProps = {
  block: LaughBlock;
  duration: number;
  isDisabled: boolean;
  // L'abscisse (px) à l'écran de l'instant 0 et la largeur (px) de la zone.
  getBar: () => Bar;
  onChoose: (key: number) => void;
  onMove: (key: number, time: number) => void;
};

// La largeur d'un bloc : la durée de son sound, sans dépasser la fin de la zone ; rien tant que la durée n'est pas lue.
const toWidth = ({ at, seconds }: LaughBlock, duration: number): string =>
  seconds === undefined
    ? "0%"
    : `${Math.max(0, Math.min(toFraction(seconds, duration), 1 - toFraction(at, duration))) * 100}%`;

const LaughBlockButton = ({
  block,
  duration,
  isDisabled,
  getBar,
  onChoose,
  onMove,
}: LaughBlockButtonProps) => {
  // L'écart entre la prise et le bord gauche du bloc, pour qu'il ne saute pas sous le doigt.
  const grab = useRef(0);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const { left, width } = getBar();
    grab.current = event.clientX - (left + toFraction(block.at, duration) * width);
    // Glisser un bloc ne déplace pas la lecture par la piste.
    event.stopPropagation();
    onChoose(block.key);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { left, width } = getBar();
    onMove(block.key, toTimeAt((event.clientX - grab.current - left) / width, duration));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = KEY_DIRECTIONS.get(event.key);
    if (direction === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onMove(block.key, block.at + direction * (event.shiftKey ? KEY_STEP_SECONDS : STEP_SECONDS));
  };

  return (
    <button
      type="button"
      data-laugh-block=""
      className={classNames(
        "laugh-block",
        block.isSelected && "laugh-block--selected",
        !block.isKept && "laugh-block--faded",
      )}
      style={{ left: toPercent(block.at, duration), width: toWidth(block, duration), minWidth: MIN_WIDTH_PX }}
      aria-label={`Rire « ${block.title} » à ${toTimecodeText(block.at)}`}
      aria-pressed={block.isSelected}
      disabled={isDisabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      onFocus={() => onChoose(block.key)}
    >
      <span className="laugh-block-label lp-type-caption">{block.title}</span>
    </button>
  );
};

type LaughTrackProps = {
  duration: number;
  blocks: readonly LaughBlock[];
  // Les rires ne se glissent pas pendant qu'un clip est traité.
  isDisabled: boolean;
  onChoose: (key: number) => void;
  // Déplace un rire à cet instant de la vidéo lue.
  onMove: (key: number, time: number) => void;
};

export const LaughTrack = ({ duration, blocks, isDisabled, onChoose, onMove }: LaughTrackProps) => {
  const lane = useRef<HTMLDivElement>(null);

  const getBar = (): Bar => {
    const box = lane.current?.getBoundingClientRect();
    return { left: box?.left ?? 0, width: Math.max(1, box?.width ?? 1) };
  };

  return (
    <TimelineTrack name="Rires">
      <TimelineLane laneRef={lane}>
        {blocks.map((block) => (
          <LaughBlockButton
            key={block.key}
            block={block}
            duration={duration}
            isDisabled={isDisabled}
            getBar={getBar}
            onChoose={onChoose}
            onMove={onMove}
          />
        ))}
      </TimelineLane>
    </TimelineTrack>
  );
};
