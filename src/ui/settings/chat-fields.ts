// Les réglages de l'onglet « Tchat » : quatre curseurs et deux choix, une table chacun. Les cases et le rendu sont dans chat-settings-tab.tsx.

import type { ChatAnimation, ChatStyle } from "../../domain/chat.schema";
import { DEFAULT_CHAT_LOOK } from "../../domain/chat-settings.rules";
import type { SegmentedOption } from "../design/segmented";
import { type SliderSpec, toSteps } from "./head-fields";

// De 10 s à 2 min, puis « Toujours » : la valeur 0 du réglage, les messages restent.
const DURATION_STEPS = [
  ...[10, 15, 20, 30, 45, 60, 90, 120].map((value) => ({
    value,
    label:
      value < 60
        ? `${value} s`
        : `${Math.floor(value / 60)} min${value % 60 === 0 ? "" : ` ${value % 60} s`}`,
  })),
  { value: 0, label: "Toujours" },
];

export const CHAT_SLIDERS: readonly SliderSpec[] = [
  {
    key: "chatOpacity",
    label: "Opacité du fond",
    help: "À 0 %, aucun fond.",
    steps: toSteps(0, 100, 5, (value) => `${value} %`),
    fallback: DEFAULT_CHAT_LOOK.opacity,
  },
  {
    key: "chatTextSize",
    label: "Taille du texte",
    help: "Les emotes suivent.",
    steps: toSteps(12, 40, 2, (value) => `${value} px`),
    fallback: DEFAULT_CHAT_LOOK.textSize,
  },
  {
    key: "chatDuration",
    label: "Durée d'affichage",
    help: "Ensuite, le message s'efface.",
    steps: DURATION_STEPS,
    fallback: DEFAULT_CHAT_LOOK.duration,
  },
  {
    key: "chatMaxMessages",
    label: "Messages à l'écran",
    help: "Les plus anciens partent d'abord.",
    steps: toSteps(3, 20, 1, (value) => String(value)),
    fallback: DEFAULT_CHAT_LOOK.maxMessages,
  },
];

export const STYLE_CHOICES: readonly SegmentedOption<ChatStyle>[] = [
  { value: "pill", label: "Pills" },
  { value: "text", label: "Texte seul" },
  { value: "panel", label: "Panneau" },
];

export const ANIMATION_CHOICES: readonly SegmentedOption<ChatAnimation>[] = [
  { value: "rise", label: "Du bas" },
  { value: "pop", label: "Pop" },
  { value: "side", label: "Du côté" },
  { value: "fade", label: "Fondu" },
];
