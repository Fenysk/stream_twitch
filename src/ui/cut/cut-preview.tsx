// L'aperçu de la découpe : la tête sur un damier, bouche fermée (avec son closing), ouverte (la pose la plus large) ou en
// train de parler (une pose toutes les `rhythm` ms, calculée par la règle du serveur : toNextMouth).

import { useEffect, useState } from "react";
import { toHeadView } from "../../domain/head.rules";
import type { Head, Mouth } from "../../domain/head.types";
import { toNextMouth } from "../../domain/mouth.rules";
import { Segmented } from "../design/segmented";
import type { ImageUrls } from "../expression-urls";
import { Head as HeadView } from "../Head";

type PreviewMode = "closed" | "open" | "talking";

const MODES = [
  { value: "closed", label: "Fermée" },
  { value: "open", label: "Ouverte" },
  { value: "talking", label: "Parle" },
] as const;

const CLOSED: Mouth = { kind: "closed" };

// La pose qui ouvre le plus : l'angle le plus grand en valeur absolue.
const toWidestMouth = ({ poses }: Head): Mouth => {
  const [first, ...others] = poses;
  if (!first) return CLOSED;
  const widest = others.reduce(
    (best, pose) => (Math.abs(pose.angle) > Math.abs(best.angle) ? pose : best),
    first,
  );
  return { kind: "open", pose: widest };
};

type CutPreviewProps = { head: Head; images: ImageUrls };

export const CutPreview = ({ head, images }: CutPreviewProps) => {
  const [mode, setMode] = useState<PreviewMode>("closed");
  const [talking, setTalking] = useState<Mouth>(CLOSED);

  useEffect(() => {
    if (mode !== "talking") return;
    const rules = { poses: head.poses, closedChance: head.closedChance, delay: 1 };
    const timer = setInterval(
      () =>
        setTalking((previous) =>
          toNextMouth({ previous, lastLoudAt: 0, now: 0, rules, random: Math.random }),
        ),
      head.rhythm,
    );
    return () => clearInterval(timer);
  }, [mode, head]);

  const mouth = mode === "closed" ? CLOSED : mode === "open" ? toWidestMouth(head) : talking;
  // Comme l'outil de découpe : l'ouverture de la tête multiplie l'angle et la levée, sans effet de voix.
  const view = toHeadView(head, { tilt: head.opening, opening: head.opening, scale: 1 }, mouth, {
    angle: 0,
    lift: 0,
  });
  return (
    <div className="cut-preview">
      <Segmented label="Aperçu" options={MODES} value={mode} onSelect={setMode} />
      <div className="cut-preview-stage settings-checker">
        <HeadView images={images} view={view} layout="box" />
      </div>
    </div>
  );
};
