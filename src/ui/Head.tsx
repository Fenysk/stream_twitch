import type { CSSProperties } from "react";
import { toClosedTransform, toPoseTransform, toStageLayout } from "../domain/head.rules";
import type { HeadView, IdlePose } from "../domain/head.types";
import type { ImageUrls } from "./expression-urls";

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
const toTopStyle = (view: HeadView): CSSProperties | undefined => {
  const { mouth } = view;
  if (mouth.kind === "closed" && view.closing === 0) return undefined;
  // Bouche fermée, la moitié haute descend de `closing` px pour toucher la mâchoire ; les poses ouvertes partent de la position dessinée.
  const { origin, shift, angle } =
    mouth.kind === "open"
      ? toPoseTransform(mouth.pose, view.cut, view)
      : toClosedTransform(view.cut, view.closing);
  return {
    transformOrigin: `${percent(origin.x, view.width)} ${percent(origin.y, view.height)}`,
    transform: `translate(${percent(shift.x, view.width)}, ${percent(shift.y, view.height)}) rotate(${round(angle)}deg)`,
  };
};

// La pose de repos penche toute la tête autour de son bas-centre (le cou) et la lève d'une fraction de sa hauteur.
const toIdleStyle = (idle: IdlePose): CSSProperties | undefined =>
  idle.angle === 0 && idle.lift === 0
    ? undefined
    : {
        transformOrigin: "50% 100%",
        transform: `translateY(${round(0 - idle.lift * 100)}%) rotate(${round(idle.angle)}deg)`,
      };

// `screen` : la page de la source OBS, qui remplit la fenêtre. `box` : la même tête dans une boîte (l'aperçu des réglages).
export type HeadLayout = "screen" | "box";

type HeadProps = { view: HeadView; images: ImageUrls; layout?: HeadLayout };

export const Head = ({ view, images, layout = "screen" }: HeadProps) => {
  const stage = toStageLayout(view);
  const ratio = `${stage.width} / ${stage.height}`;
  const stageWidth =
    layout === "screen" ? `min(100vw, calc(100vh * ${stage.width} / ${stage.height}))` : "100%";
  const content = (
    <div style={{ position: "relative", aspectRatio: ratio, width: stageWidth }}>
      <div
        style={{
          position: "absolute",
          left: percent(stage.left, stage.width),
          top: percent(stage.top, stage.height),
          width: percent(view.width, stage.width),
          height: percent(view.height, stage.height),
          ...toIdleStyle(view.idle),
        }}
      >
        <img alt="" draggable={false} src={images.bottom} style={layer} />
        <img alt="" draggable={false} src={images.top} style={{ ...layer, ...toTopStyle(view) }} />
      </div>
    </div>
  );
  if (layout === "box") return content;
  return <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center" }}>{content}</div>;
};
