// Ce que la page `/show` montre : rien (transparente) ; l'ouverture et la clôture (un fond sobre, un bandeau, Jean-Renard grand à droite) ;
// le carton d'un clip (le début du clip, flou et assombri en fond, un bandeau avec le jour et le titre, Jean-Renard grand à droite) ; le
// clip qui joue (son titre dans un coin, Jean-Renard petit dans l'autre). Les fondus et les glissements sont du CSS.

import { CLOSING_BANNER, OPENING_BANNER } from "../../domain/show.rules";
import { toDayText } from "../clips/clip-text";

// Deux <video> : l'un joue pendant que l'autre charge le suivant.
export type Slot = 0 | 1;

export type ShowView =
  | { kind: "none" }
  | { kind: "opening" }
  | { kind: "card"; slot: Slot; title: string; day: string }
  | { kind: "clip"; slot: Slot; title: string }
  | { kind: "closing" };

export const NO_VIEW: ShowView = { kind: "none" };

// Où Jean-Renard se tient : grand à droite (ouverture, carton, clôture), ou petit dans un coin pendant le clip.
export type FoxSpot = "beside" | "corner";

export const toFoxSpot = ({ kind }: ShowView): FoxSpot => (kind === "clip" ? "corner" : "beside");

// Le bandeau : un petit texte au-dessus, le titre en gros. Celui d'un clip porte le jour de son enregistrement ; rien hors de
// l'ouverture, de la clôture et des cartons.
export type Banner = { kicker: string; title: string };

export const toBanner = (view: ShowView, now: number): Banner | null => {
  if (view.kind === "opening") return OPENING_BANNER;
  if (view.kind === "closing") return CLOSING_BANNER;
  return view.kind === "card" ? { kicker: toDayText(view.day, now), title: view.title } : null;
};

// Le clip d'indice `index` de l'émission passe dans l'un des deux <video>, l'un après l'autre.
export const toSlot = (index: number): Slot => (index % 2 === 0 ? 0 : 1);

// L'emplacement dont la vidéo se voit : celui du carton (son début, flou) puis du clip qui joue.
export const toShownSlot = (view: ShowView): Slot | null =>
  view.kind === "card" || view.kind === "clip" ? view.slot : null;
