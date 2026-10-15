import { z } from "zod";
import { DEFAULT_CHAT_LOOK } from "./chat-settings.rules";
import {
  type CycleBinding,
  CycleBindingSchema,
  DECK_SETTINGS,
  type DeckCycleSetting,
  type DeckSetting,
  type DeckToggleSetting,
  DeckToggleSettingSchema,
  type DeckValue,
  DeckValueSchema,
  type PhraseBinding,
  PhraseBindingSchema,
  type PresetBinding,
  PresetBindingSchema,
  type PresetPair,
  PresetPairSchema,
  type ToggleBinding,
  ToggleBindingSchema,
} from "./deck.schema";
import { PHOTO_ID } from "./expression.schema";
import { type EditableSettings, EditableSettingsSchema, type SettingsChanges } from "./settings.schema";

// Ce que les règles lisent des valeurs effectives : les réglages d'une touche, rien d'autre.
export type DeckEffective = Pick<EditableSettings, DeckSetting>;

// Ce que la page des réglages montre quand le réglage n'a pas de valeur (fox-cards.tsx, fox-fields.ts, chat-settings.rules.ts).
const TOGGLE_FALLBACKS: Record<DeckToggleSetting, boolean> = {
  foxShouldReadChat: true,
  foxShouldReadOwn: true,
  foxShouldReviewAtEnd: true,
  foxShouldThank: true,
  foxShouldWelcome: true,
  chatShouldShowHidden: DEFAULT_CHAT_LOOK.shouldShowHidden,
};

export const toEffectiveToggle = (effective: DeckEffective, setting: DeckToggleSetting): boolean =>
  effective[setting] ?? TOGGLE_FALLBACKS[setting];

// Un appui sur l'interrupteur : l'inverse de la valeur effective, pour ce réglage seulement.
export const toToggleChanges = ({ setting }: ToggleBinding, effective: DeckEffective): SettingsChanges => ({
  [setting]: !toEffectiveToggle(effective, setting),
});

// Les réglages d'une touche viennent du Stream Deck : ils passent par le schéma avant d'être crus.
export const toToggleBinding = (raw: unknown): ToggleBinding | undefined => {
  const parsed = ToggleBindingSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

const CYCLE_FALLBACKS: Record<DeckCycleSetting, number | string> = {
  chatTextSize: DEFAULT_CHAT_LOOK.textSize,
  chatOpacity: DEFAULT_CHAT_LOOK.opacity,
  chatDuration: DEFAULT_CHAT_LOOK.duration,
  chatMaxMessages: DEFAULT_CHAT_LOOK.maxMessages,
  chatStyle: DEFAULT_CHAT_LOOK.style,
  chatAnimation: DEFAULT_CHAT_LOOK.animation,
  expression: PHOTO_ID,
};

// Sans valeur, l'expression est la photo : la page des réglages la montre (expression-card.tsx).
export const toEffectiveCycleValue = (effective: DeckEffective, setting: DeckCycleSetting): number | string =>
  effective[setting] ?? CYCLE_FALLBACKS[setting];

// Une valeur que le serveur accepterait pour ce réglage : le schéma du réglage dit oui, et c'est une valeur (le schéma d'un
// réglage facultatif accepterait aussi l'absence).
export const isValueOfSetting = (setting: DeckSetting, value: unknown): value is DeckValue =>
  DeckValueSchema.safeParse(value).success && EditableSettingsSchema.shape[setting].safeParse(value).success;

// La valeur qui suit `current` dans la liste, la première après la dernière ou quand `current` n'y est pas.
export const toNextValue = (values: readonly DeckValue[], current: DeckValue): DeckValue | undefined =>
  values.length === 0 ? undefined : values[(values.indexOf(current) + 1) % values.length];

// Ce qu'on demande au serveur pour une valeur : il retire l'expression pour revenir à la photo, `null`, comme la page des
// réglages (expression-card.tsx).
const toChangeValue = (setting: DeckSetting, value: DeckValue): DeckValue | null =>
  setting === "expression" && value === PHOTO_ID ? null : value;

// Un appui sur le cycle : la valeur suivante, pour ce réglage seulement.
export const toCycleChanges = (
  { setting, values }: CycleBinding,
  effective: DeckEffective,
): SettingsChanges | undefined => {
  const next = toNextValue(values, toEffectiveCycleValue(effective, setting));
  return next === undefined ? undefined : { [setting]: toChangeValue(setting, next) };
};

// Les valeurs sont lues sans être crues : chacune doit passer le schéma du réglage, sans quoi elle est écartée (et non la touche).
const RawCycleBindingSchema = CycleBindingSchema.extend({ values: z.array(z.unknown()).default([]) });

export const toCycleBinding = (raw: unknown): CycleBinding | undefined => {
  const parsed = RawCycleBindingSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { values, ...rest } = parsed.data;
  const permitted = [...new Set(values)].filter((value): value is DeckValue =>
    isValueOfSetting(rest.setting, value),
  );
  return { ...rest, values: permitted };
};

export const isDeckToggle = (setting: DeckSetting): setting is DeckToggleSetting =>
  DeckToggleSettingSchema.safeParse(setting).success;

export const toEffectiveValue = (effective: DeckEffective, setting: DeckSetting): DeckValue =>
  isDeckToggle(setting) ? toEffectiveToggle(effective, setting) : toEffectiveCycleValue(effective, setting);

// Le catalogue de l'inspecteur : la valeur qui s'applique à chaque réglage offert.
export const toEffectiveValues = (effective: DeckEffective): Record<string, DeckValue> =>
  Object.fromEntries(DECK_SETTINGS.map((setting) => [setting, toEffectiveValue(effective, setting)]));

// Les paires sont lues sans être crues : chacune doit passer le schéma du réglage, sans quoi elle est écartée (et non la touche) ;
// au plus une paire par réglage, la première.
const RawPresetBindingSchema = PresetBindingSchema.extend({ pairs: z.array(z.unknown()).default([]) });

export const toPresetBinding = (raw: unknown): PresetBinding | undefined => {
  const parsed = RawPresetBindingSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { pairs, ...rest } = parsed.data;
  const permitted: PresetPair[] = [];
  for (const candidate of pairs) {
    const pair = PresetPairSchema.safeParse(candidate);
    if (!pair.success || !isValueOfSetting(pair.data.setting, pair.data.value)) continue;
    if (!permitted.some(({ setting }) => setting === pair.data.setting)) permitted.push(pair.data);
  }
  return { ...rest, pairs: permitted };
};

// Un appui sur le préréglage : toutes ses paires dans une seule demande.
export const toPresetChanges = ({ pairs }: PresetBinding): SettingsChanges | undefined =>
  pairs.length === 0
    ? undefined
    : Object.fromEntries(pairs.map(({ setting, value }) => [setting, toChangeValue(setting, value)]));

// Actif : le serveur applique déjà toutes ses valeurs. Sans paire, il ne change rien : il n'est jamais actif.
export const isPresetActive = ({ pairs }: PresetBinding, effective: DeckEffective): boolean =>
  pairs.length > 0 && pairs.every(({ setting, value }) => toEffectiveValue(effective, setting) === value);

// Le texte garde ses espaces : c'est ce que le renard dira (toSpeechText les nettoie à l'envoi).
export const toPhraseBinding = (raw: unknown): PhraseBinding | undefined => {
  const parsed = PhraseBindingSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};
