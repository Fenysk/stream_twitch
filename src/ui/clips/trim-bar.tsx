// La barre sous le lecteur : toute la durée du clip, la partie gardée en couleur entre deux poignées (début et fin), et la position
// de lecture. Une poignée se glisse à la souris ou au doigt, ou se déplace d'une image aux flèches (1 s avec Maj). Cliquer ou glisser
// ailleurs sur la barre déplace la lecture. Début et fin se calent sur les images (1/60 s).

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { STEP_SECONDS, type Trim, toFraction, toNearestStep, toTimeAt } from "../../domain/trim.rules";
import { toTimecodeText } from "./clip-text";

type TrimBarProps = {
  duration: number;
  trim: Trim;
  // La position de lecture.
  time: number;
  // Début et fin ne se changent pas : les poignées sont désactivées, la lecture se déplace encore.
  isDisabled?: boolean;
  onStartChange: (time: number) => void;
  onEndChange: (time: number) => void;
  onSeek: (time: number) => void;
};

type HandleProps = {
  label: string;
  time: number;
  duration: number;
  side: "start" | "end";
  isDisabled: boolean;
  // Pose la poignée à l'instant donné (la barre le cale sur une image et le borne).
  onChange: (time: number) => void;
  // L'abscisse (px) du bord de la poignée tournée vers la partie gardée, de quoi garder l'écart de la prise.
  getEdge: () => number;
  // L'abscisse (px) à l'écran de l'instant 0 et la largeur (px) de la barre.
  getBar: () => { left: number; width: number };
};

const toPercent = (time: number, duration: number): string => `${toFraction(time, duration) * 100}%`;

const KEY_STEP_SECONDS = 1;
const KEY_DIRECTIONS = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

// Une poignée : un curseur à une valeur (début ou fin), posé au bord de la partie gardée et tourné vers elle, pour que les deux
// ne se recouvrent jamais.
const Handle = ({ label, time, duration, side, isDisabled, onChange, getEdge, getBar }: HandleProps) => {
  // L'écart entre la prise et le bord de la poignée, pour qu'elle ne saute pas sous le doigt.
  const grab = useRef(0);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = event.clientX - getEdge();
    event.stopPropagation();
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { left, width } = getBar();
    onChange(toNearestStep(toTimeAt((event.clientX - grab.current - left) / width, duration)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = KEY_DIRECTIONS.get(event.key);
    if (direction === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(toNearestStep(time + direction * (event.shiftKey ? KEY_STEP_SECONDS : STEP_SECONDS)));
  };

  return (
    <button
      type="button"
      role="slider"
      className={`trim-handle trim-handle--${side}`}
      style={{ left: toPercent(time, duration) }}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      aria-valuetext={toTimecodeText(time)}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
    />
  );
};

export const TrimBar = ({
  duration,
  trim,
  time,
  isDisabled = false,
  onStartChange,
  onEndChange,
  onSeek,
}: TrimBarProps) => {
  const area = useRef<HTMLDivElement>(null);

  const getBar = () => {
    const box = area.current?.getBoundingClientRect();
    return { left: box?.left ?? 0, width: Math.max(1, box?.width ?? 1) };
  };
  const getEdge = (at: number) => () => {
    const { left, width } = getBar();
    return left + toFraction(at, duration) * width;
  };

  // Un clic ou un glissement sur la barre place la lecture à cet instant.
  const seekAt = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = getBar();
    onSeek(toTimeAt((event.clientX - left) / width, duration));
  };

  return (
    <div className="trim-bar">
      {/* La barre se manie à la souris ; au clavier, la lecture se pilote avec Espace et les flèches (use-clip-keys.ts). */}
      <div
        ref={area}
        className="trim-area"
        role="presentation"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event);
        }}
      >
        <div className="trim-track" />
        <div
          className="trim-range"
          style={{
            left: toPercent(trim.start, duration),
            width: `${(toFraction(trim.end, duration) - toFraction(trim.start, duration)) * 100}%`,
          }}
        />
        <div className="trim-playhead" style={{ left: toPercent(time, duration) }} />
        <Handle
          label="Début de la partie gardée"
          side="start"
          isDisabled={isDisabled}
          time={trim.start}
          duration={duration}
          onChange={onStartChange}
          getEdge={getEdge(trim.start)}
          getBar={getBar}
        />
        <Handle
          label="Fin de la partie gardée"
          side="end"
          isDisabled={isDisabled}
          time={trim.end}
          duration={duration}
          onChange={onEndChange}
          getEdge={getEdge(trim.end)}
          getBar={getBar}
        />
      </div>
    </div>
  );
};
