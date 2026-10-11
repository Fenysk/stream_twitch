import type { CSSProperties } from "react";
import { toPoseTransform, toStageLayout } from "../domain/head.rules";
import type { HeadView, Pose } from "../domain/head.types";

const round = (value: number) => Math.round(value * 1000) / 1000;
const percent = (value: number, total: number) => `${round((value / total) * 100)}%`;

const layer: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

// Aucune transition CSS : la bouche s'ouvre par à-coups, une pose à la fois.
const toTopStyle = (view: HeadView, pose: Pose): CSSProperties => {
  const { origin, shift, angle } = toPoseTransform(pose, view.cut, view);
  return {
    transformOrigin: `${percent(origin.x, view.width)} ${percent(origin.y, view.height)}`,
    transform: `translate(${percent(shift.x, view.width)}, ${percent(shift.y, view.height)}) rotate(${round(angle)}deg)`,
  };
};

export const Head = ({ view }: { view: HeadView }) => {
  const stage = toStageLayout(view);
  const topStyle = view.mouth.kind === "open" ? toTopStyle(view, view.mouth.pose) : undefined;
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}>
      <div
        style={{
          position: "relative",
          aspectRatio: `${stage.width} / ${stage.height}`,
          width: `min(100vw, calc(100vh * ${stage.width} / ${stage.height}))`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: percent(stage.left, stage.width),
            top: percent(stage.top, stage.height),
            width: percent(view.width, stage.width),
            height: percent(view.height, stage.height),
          }}
        >
          <img alt="" draggable={false} src="/api/head/image/bottom" style={layer} />
          <img alt="" draggable={false} src="/api/head/image/top" style={{ ...layer, ...topStyle }} />
        </div>
      </div>
    </div>
  );
};
