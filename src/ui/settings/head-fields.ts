// Les cinq curseurs de l'onglet « Tête South Park » : une table, un rendu. Tout le reste des réglages reste dans settings.json.

import type { EditableSettings } from "../../domain/settings.schema";
import type { SliderStep } from "../design/slider";

export type SliderKey = keyof EditableSettings;

export type SliderSpec = {
  key: SliderKey;
  label: string;
  help: string;
  steps: readonly SliderStep[];
  // Montré quand le réglage n'a pas de valeur dans settings.json : ce que le serveur applique alors.
  fallback: number;
};

// De `from` à `to` par pas de `step`, à l'entier près : 0.1 × 3 ne donne pas 0.30000000000000004.
const toSteps = (from: number, to: number, step: number, format: (value: number) => string): SliderStep[] => {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const count = Math.round((to - from) / step);
  return Array.from({ length: count + 1 }, (_, index) => {
    const value = Number((from + index * step).toFixed(decimals));
    return { value, label: format(value) };
  });
};

// La virgule française pour les facteurs : ×0,5.
const toTimes = (value: number): string => `×${String(value).replace(".", ",")}`;

export const SLIDERS: readonly SliderSpec[] = [
  {
    key: "threshold",
    label: "Seuil du micro",
    help: "En dessous, la bouche reste fermée.",
    steps: toSteps(-60, 0, 1, (value) => `${value} dB`),
    fallback: -40,
  },
  {
    key: "tilt",
    label: "Pivot",
    help: "Angle du haut de la tête.",
    steps: toSteps(0, 2, 0.1, toTimes),
    fallback: 1,
  },
  {
    key: "opening",
    label: "Ouverture",
    help: "Écart entre le haut et la mâchoire.",
    steps: toSteps(0, 3, 0.1, toTimes),
    fallback: 1,
  },
  {
    key: "voiceEffect",
    label: "Effet de la voix",
    help: "Plus tu parles fort, plus ça s'ouvre.",
    steps: toSteps(0, 1, 0.1, (value) => `${Math.round(value * 100)} %`),
    fallback: 1,
  },
  {
    key: "idleAngle",
    label: "Penché au repos",
    help: "Quand tu te tais.",
    steps: toSteps(0, 15, 1, (value) => `${value}°`),
    fallback: 0,
  },
];

export const SLIDER_KEYS: readonly SliderKey[] = SLIDERS.map(({ key }) => key);

// Le cran le plus proche : une valeur de settings.json entre deux crans (un pivot de 0.85) place quand même le curseur.
export const toNearestStep = ({ steps, fallback }: SliderSpec, value: number | null | undefined): number => {
  const target = value ?? fallback;
  let nearest = steps[0]?.value ?? target;
  for (const { value: candidate } of steps) {
    if (Math.abs(candidate - target) < Math.abs(nearest - target)) nearest = candidate;
  }
  return nearest;
};
