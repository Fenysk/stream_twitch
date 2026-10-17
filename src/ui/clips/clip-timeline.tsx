// La timeline sous le lecteur : une règle, des pistes (nom à gauche, zone à droite) et un seul trait de lecture. La règle et les zones ont
// la même largeur et la même marge (--trim-handle-width) : un instant tombe à la même abscisse partout. Une piste de plus : un TimelineTrack.

import { createContext, type PointerEvent, type ReactNode, type RefObject, useContext, useRef } from "react";
import { toRulerTimes } from "../../domain/timeline.rules";
import { toFraction, toTimeAt } from "../../domain/trim.rules";
import { toDurationText } from "./clip-text";

type Timeline = { duration: number; onSeek: (time: number) => void };

const TimelineContext = createContext<Timeline | null>(null);

const useTimeline = (): Timeline => {
  const timeline = useContext(TimelineContext);
  if (!timeline) throw new Error("une piste se pose dans une ClipTimeline");
  return timeline;
};

// La position d'un instant sur la zone, en pourcentage de la durée.
export const toPercent = (time: number, duration: number): string => `${toFraction(time, duration) * 100}%`;

type TimelineLaneProps = {
  // La zone, de quoi mesurer où tombe la souris (les blocs d'une piste en ont besoin pour glisser) ; sans elle, la zone se mesure seule.
  laneRef?: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
};

// La zone d'une piste, ou de la règle : le vide de la zone déplace la lecture.
export const TimelineLane = ({ laneRef, children }: TimelineLaneProps) => {
  const { duration, onSeek } = useTimeline();
  const own = useRef<HTMLDivElement>(null);
  const lane = laneRef ?? own;

  const seekAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = lane.current?.getBoundingClientRect();
    onSeek(toTimeAt((event.clientX - (box?.left ?? 0)) / Math.max(1, box?.width ?? 1), duration));
  };

  return (
    <div className="timeline-zone">
      {/* La zone se manie à la souris ; au clavier, la lecture se pilote avec Espace et les flèches (use-clip-keys.ts). */}
      <div
        ref={lane}
        className="timeline-lane"
        role="presentation"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event);
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Une piste : son nom, puis sa zone (une `TimelineLane`, ou une barre qui a la même géométrie).
export const TimelineTrack = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="timeline-track">
    <span className="timeline-name lp-type-caption lp-muted">{name}</span>
    {children}
  </div>
);

// La règle : une graduation et son libellé (« 0:15 ») à chaque pas rond, dix libellés au plus.
const TimelineRuler = () => {
  const { duration } = useTimeline();
  return (
    <div className="timeline-track timeline-track--ruler">
      <span className="timeline-name" aria-hidden="true" />
      <TimelineLane>
        {toRulerTimes(duration).map((time) => (
          <span key={time} className="timeline-tick" style={{ left: toPercent(time, duration) }}>
            <span className="timeline-tick-label lp-type-numeric">{toDurationText(time)}</span>
          </span>
        ))}
      </TimelineLane>
    </div>
  );
};

type ClipTimelineProps = {
  duration: number;
  // La position de lecture.
  time: number;
  onSeek: (time: number) => void;
  children: ReactNode;
};

export const ClipTimeline = ({ duration, time, onSeek, children }: ClipTimelineProps) => (
  <TimelineContext value={{ duration, onSeek }}>
    <div className="clip-timeline">
      <TimelineRuler />
      {children}
      <div className="timeline-playhead-layer" aria-hidden="true">
        <div className="timeline-axis">
          <div className="timeline-playhead" style={{ left: toPercent(time, duration) }} />
        </div>
      </div>
    </div>
  </TimelineContext>
);
