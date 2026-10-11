// Le plateau de découpe : l'image sur un damier, la ligne de coupe en rouge sur toute la largeur, la zone sous la coupe
// teintée (la moitié basse) et deux poignées, une par charnière. Glisser une poignée la déplace, glisser la ligne
// déplace les deux ; au clavier, les flèches déplacent la poignée choisie de 1 px (10 px avec Maj).

import { type PointerEvent, useRef } from "react";
import { type ImageSize, toMovedCut, toNudge, toPartPolygons } from "../../domain/cut.rules";
import type { Cut, Point } from "../../domain/head.types";
import { type CssVariables, classNames } from "../design/class-names";

export type HingeSide = "left" | "right";

type CutBoardProps = {
  sourceUrl: string;
  size: ImageSize;
  cut: Cut;
  selected: HingeSide;
  onSelect: (side: HingeSide) => void;
  onCutChange: (cut: Cut) => void;
};

const SIDE_LABELS: Record<HingeSide, string> = { left: "Charnière gauche", right: "Charnière droite" };

const toPercent = (value: number, total: number): string => `${(value / total) * 100}%`;

export const CutBoard = ({ sourceUrl, size, cut, selected, onSelect, onCutChange }: CutBoardProps) => {
  const board = useRef<HTMLDivElement>(null);
  // La coupe au début du glissement de la ligne : chaque mouvement part d'elle, pas de la coupe déjà déplacée.
  const lineStart = useRef<{ y: number; cut: Cut } | null>(null);

  const toImagePoint = (event: PointerEvent): Point => {
    const box = board.current?.getBoundingClientRect();
    if (!box) return cut.left;
    return {
      x: ((event.clientX - box.left) / box.width) * size.width,
      y: ((event.clientY - box.top) / box.height) * size.height,
    };
  };

  // La proportion de l'image : le plateau garde sa forme, et sa hauteur ne dépasse pas l'écran (cut-tab.css).
  const ratio: CssVariables = { "--cut-ratio": String(size.width / size.height) };
  const polygons = toPartPolygons(cut, size);
  const [atLeft, atRight] = polygons.bottom;
  const startY = atLeft?.y ?? cut.left.y;
  const endY = atRight?.y ?? cut.right.y;
  // Un plateau et une image de même proportion : l'angle de la coupe est le même à l'écran qu'en pixels d'image.
  const angle = Math.atan2(cut.right.y - cut.left.y, cut.right.x - cut.left.x);

  return (
    <div ref={board} className="cut-board settings-checker" style={ratio}>
      <img className="cut-board-image" src={sourceUrl} alt="" draggable={false} />
      <svg
        className="cut-board-overlay"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon className="cut-zone" points={polygons.bottom.map(({ x, y }) => `${x},${y}`).join(" ")} />
        <line
          className="cut-line"
          x1={0}
          y1={startY}
          x2={size.width}
          y2={endY}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <button
        type="button"
        className="cut-line-grip"
        aria-label="Ligne de coupe"
        style={{
          top: toPercent((startY + endY) / 2, size.height),
          transform: `translateY(-50%) rotate(${angle}rad)`,
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          lineStart.current = { y: event.clientY, cut };
        }}
        onPointerMove={(event) => {
          const start = lineStart.current;
          const box = board.current?.getBoundingClientRect();
          if (!start || !box || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const dy = ((event.clientY - start.y) / box.height) * size.height;
          onCutChange(toMovedCut(start.cut, { kind: "line", dy }, size));
        }}
        onPointerUp={() => {
          lineStart.current = null;
        }}
        onKeyDown={(event) => {
          const nudge = toNudge(event.key, event.shiftKey);
          if (!nudge || nudge.y === 0) return;
          event.preventDefault();
          onCutChange(toMovedCut(cut, { kind: "line", dy: nudge.y }, size));
        }}
      />
      {(["left", "right"] as const).map((side) => {
        const point = cut[side];
        return (
          <button
            key={side}
            type="button"
            className={classNames("cut-handle", side === selected && "is-selected")}
            aria-label={SIDE_LABELS[side]}
            style={{ left: toPercent(point.x, size.width), top: toPercent(point.y, size.height) }}
            onFocus={() => onSelect(side)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelect(side);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              onCutChange(toMovedCut(cut, { kind: "handle", side, to: toImagePoint(event) }, size));
            }}
            onKeyDown={(event) => {
              const nudge = toNudge(event.key, event.shiftKey);
              if (!nudge) return;
              event.preventDefault();
              const to = { x: point.x + nudge.x, y: point.y + nudge.y };
              onCutChange(toMovedCut(cut, { kind: "handle", side, to }, size));
            }}
          />
        );
      })}
    </div>
  );
};
