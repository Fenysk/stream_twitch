import { isDeckToggle } from "../../src/domain/deck.rules";
import type {
  DeckCycleSetting,
  DeckSetting,
  DeckValue,
  PhraseBinding,
  PhraseKind,
} from "../../src/domain/deck.schema";
import type { ExpressionSummary } from "../../src/domain/expression.schema";
import type { SliderStep } from "../../src/ui/design/slider";
import { ANIMATION_CHOICES, CHAT_SLIDERS, STYLE_CHOICES } from "../../src/ui/settings/chat-fields";
import { FOX_TOGGLES } from "../../src/ui/settings/fox-fields";

// Le nom d'un préréglage que l'utilisateur n'a pas nommé : sur la touche, et en exemple dans le champ du panneau.
export const DEFAULT_PRESET_NAME = "Préréglage";

// Ce que dit une touche « Phrase » : le choix du panneau, et le nom que la touche porte tant qu'on ne lui en a pas donné un.
export const PHRASE_CHOICES: readonly { value: PhraseKind; label: string }[] = [
  { value: "text", label: "Texte" },
  { value: "review", label: "Bilan du live" },
];

export const DEFAULT_PHRASE_NAMES: Record<PhraseKind, string> = { text: "Phrase", review: "Bilan du live" };

export const toPhraseName = ({ name, kind }: PhraseBinding): string => name || DEFAULT_PHRASE_NAMES[kind];

// Un choix offert pour un réglage : sa valeur, et ce que la page des réglages écrit pour elle.
export type DeckChoice = { value: DeckValue; label: string };

// Les libellés de la page des réglages, jamais d'autres : trois cases n'ont de libellé que dans le JSX (fox-cards.tsx,
// chat-settings-tab.tsx), les trois autres sont dans la table de l'onglet « Renard ».
const PAGE_LABELS: Partial<Record<DeckSetting, string>> = {
  foxShouldReadChat: "Lire le tchat",
  foxShouldReadOwn: "Lire mes messages",
  chatShouldShowHidden: "Afficher les commandes et les bots",
  chatStyle: "Style",
  chatAnimation: "Animation d'apparition",
  expression: "Expression",
};

const TABLE_LABELS: ReadonlyMap<string, string> = new Map([
  ...FOX_TOGGLES.map(({ key, label }) => [key, label] as const),
  ...CHAT_SLIDERS.map(({ key, label }) => [key, label] as const),
]);

export const toSettingLabel = (setting: DeckSetting): string =>
  PAGE_LABELS[setting] ?? TABLE_LABELS.get(setting) ?? setting;

const SLIDER_STEPS: ReadonlyMap<string, readonly SliderStep[]> = new Map(
  CHAT_SLIDERS.map(({ key, steps }) => [key, steps]),
);

// Les crans du curseur de la page pour un réglage à nombre ; rien pour les autres.
export const toSliderSteps = (setting: DeckSetting): readonly SliderStep[] | undefined =>
  SLIDER_STEPS.get(setting);

// Le cran le plus proche d'une valeur : un curseur ne montre que des crans, même quand le serveur a une valeur entre deux.
export const toNearestStep = (steps: readonly SliderStep[], value: DeckValue): number | undefined => {
  if (typeof value !== "number") return steps[0]?.value;
  return steps.reduce<SliderStep | undefined>(
    (nearest, step) =>
      !nearest || Math.abs(step.value - value) < Math.abs(nearest.value - value) ? step : nearest,
    undefined,
  )?.value;
};

const TOGGLE_CHOICES: readonly DeckChoice[] = [
  { value: true, label: "Activé" },
  { value: false, label: "Désactivé" },
];

// Les valeurs qu'un cycle peut parcourir : les crans du curseur de la page, les choix de style ou d'animation, les expressions.
export const toCycleChoices = (
  setting: DeckCycleSetting,
  expressions: readonly ExpressionSummary[],
): readonly DeckChoice[] => {
  if (setting === "chatStyle") return STYLE_CHOICES;
  if (setting === "chatAnimation") return ANIMATION_CHOICES;
  if (setting === "expression") return expressions.map(({ id, name }) => ({ value: id, label: name }));
  return SLIDER_STEPS.get(setting) ?? [];
};

// Les valeurs qu'un préréglage peut donner à un réglage : vrai ou faux pour une case, les choix d'un cycle sinon.
export const toChoices = (
  setting: DeckSetting,
  expressions: readonly ExpressionSummary[],
): readonly DeckChoice[] => (isDeckToggle(setting) ? TOGGLE_CHOICES : toCycleChoices(setting, expressions));

// Ce que la touche écrit pour la valeur effective : le libellé du choix, sinon la valeur telle quelle (un cran que la page n'a pas).
export const toValueLabel = (
  setting: DeckCycleSetting,
  value: DeckValue,
  expressions: readonly ExpressionSummary[],
): string =>
  toCycleChoices(setting, expressions).find((choice) => choice.value === value)?.label ?? String(value);
