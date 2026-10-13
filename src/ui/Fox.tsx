import type { RefObject } from "react";
import { FOX_CANVAS, FOX_IMAGES, type FoxImage } from "../domain/fox.schema";
import { toFoxImageUrl } from "./fox-urls";

// `screen` : la page de la source OBS, qui remplit la fenêtre, le renard posé en bas. `box` : le même renard dans une
// boîte (l'aperçu des réglages).
export type FoxLayout = "screen" | "box";

type FoxProps = {
  image: FoxImage;
  // Le corps : la page lui écrit son échelle à chaque image, sans repasser par React.
  bodyRef: RefObject<HTMLDivElement | null>;
  layout?: FoxLayout;
};

const layer = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
} as const;

// Les 12 images sont toutes dans la page, empilées : changer d'image n'est qu'un changement de `visibility`, sans
// chargement. `decoding="sync"` : la nouvelle image se peint avec le reste de l'image, jamais une image vide entre deux.
export const Fox = ({ image, bodyRef, layout = "screen" }: FoxProps) => {
  const width =
    layout === "screen" ? `min(100vw, calc(100vh * ${FOX_CANVAS.width} / ${FOX_CANVAS.height}))` : "100%";
  const content = (
    <div style={{ position: "relative", aspectRatio: `${FOX_CANVAS.width} / ${FOX_CANVAS.height}`, width }}>
      <div ref={bodyRef} style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%" }}>
        {FOX_IMAGES.map((name) => (
          <img
            key={name}
            alt=""
            draggable={false}
            decoding="sync"
            src={toFoxImageUrl(name)}
            style={{ ...layer, visibility: name === image ? "visible" : "hidden" }}
          />
        ))}
      </div>
    </div>
  );
  if (layout === "box") return content;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {content}
    </div>
  );
};
