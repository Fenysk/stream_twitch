// Les réglages de l'émission dans l'onglet « Émission » : un curseur et deux listes de phrases, une table chacun. Les cartes et le
// rendu sont dans show-episode-cards.tsx.

import { DEFAULT_SHOW_CLIP_COUNT } from "../../domain/show.rules";
import { type ListSpec, type SliderSpec, toSteps } from "./head-fields";

export const SHOW_CLIP_COUNT_SLIDER: SliderSpec = {
  key: "showClipCount",
  label: "Clips par émission",
  help: "Les moins passés d'abord, au hasard entre ceux qui l'ont été autant. Appliqué à la prochaine émission.",
  steps: toSteps(1, 20, 1, (value) => String(value)),
  fallback: DEFAULT_SHOW_CLIP_COUNT,
};

export const SHOW_LISTS: readonly ListSpec[] = [
  {
    key: "showOpeningPhrases",
    label: "Phrases d'ouverture",
    help: "Une phrase par ligne. Jean-Renard en dit une au début de l'émission, au hasard, sans répéter avant d'avoir tout dit.",
    rows: 4,
  },
  {
    key: "showClosingPhrases",
    label: "Phrases de clôture",
    help: "Une phrase par ligne. Jean-Renard en dit une à la fin de l'émission, avant de revenir sur /fox.",
    rows: 4,
  },
];
