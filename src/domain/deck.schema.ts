import { z } from "zod";
import { ExpressionSummarySchema } from "./expression.schema";

// Les réglages qu'une touche du Stream Deck peut piloter. Une liste fermée : la touche et son inspecteur n'offrent rien d'autre.
// Les libellés sont ceux de la page des réglages (streamdeck/src/deck-catalogue.ts).
export const DECK_TOGGLE_SETTINGS = [
  "foxShouldReadChat",
  "foxShouldReadOwn",
  "foxShouldReviewAtEnd",
  "foxShouldThank",
  "foxShouldWelcome",
  "chatShouldShowHidden",
] as const;
export const DeckToggleSettingSchema = z.enum(DECK_TOGGLE_SETTINGS);
export type DeckToggleSetting = z.infer<typeof DeckToggleSettingSchema>;

// Les réglages à valeurs discrètes : un cran d'un curseur de la page, un choix de style ou d'animation, ou l'expression de la tête.
export const DECK_CYCLE_SETTINGS = [
  "chatTextSize",
  "chatOpacity",
  "chatDuration",
  "chatMaxMessages",
  "chatStyle",
  "chatAnimation",
  "expression",
] as const;
export const DeckCycleSettingSchema = z.enum(DECK_CYCLE_SETTINGS);
export type DeckCycleSetting = z.infer<typeof DeckCycleSettingSchema>;

export const DECK_SETTINGS = [...DECK_TOGGLE_SETTINGS, ...DECK_CYCLE_SETTINGS] as const;
export const DeckSettingSchema = z.enum(DECK_SETTINGS);
export type DeckSetting = z.infer<typeof DeckSettingSchema>;

// La valeur d'un réglage telle que le serveur la garde : vrai ou faux, un nombre, un texte.
export const DeckValueSchema = z.union([z.boolean(), z.number(), z.string()]);
export type DeckValue = z.infer<typeof DeckValueSchema>;

// Ce que la touche affiche en premier : le nom que l'utilisateur lui donne, sinon le libellé du réglage.
const BindingNameSchema = z.string().trim().max(40);

// Ce que garde une touche « Interrupteur » : un réglage à case. Le Stream Deck le renvoie tel qu'il l'a stocké, donc non fiable.
export const ToggleBindingSchema = z.object({
  setting: DeckToggleSettingSchema,
  name: BindingNameSchema.optional(),
});
export type ToggleBinding = z.infer<typeof ToggleBindingSchema>;

// Ce que garde une touche « Cycle de valeurs » : un réglage et les valeurs qu'un appui parcourt, dans l'ordre du catalogue. Chaque
// valeur doit être permise par le schéma du réglage : toCycleBinding (deck.rules.ts) écarte les autres.
export const CycleBindingSchema = z.object({
  setting: DeckCycleSettingSchema,
  values: z.array(DeckValueSchema).default([]),
  name: BindingNameSchema.optional(),
});
export type CycleBinding = z.infer<typeof CycleBindingSchema>;

// Ce que garde une touche « Préréglage » : un nom, et une valeur pour chaque réglage qu'il change (au plus une par réglage).
export const PresetPairSchema = z.object({ setting: DeckSettingSchema, value: DeckValueSchema });
export type PresetPair = z.infer<typeof PresetPairSchema>;

export const PresetBindingSchema = z.object({
  name: BindingNameSchema.optional(),
  pairs: z.array(PresetPairSchema).default([]),
});
export type PresetBinding = z.infer<typeof PresetBindingSchema>;

// Ce que garde une touche « Phrase » : un texte que le renard dit, ou le bilan du live. `text` reste gardé quand on passe au bilan.
export const PHRASE_KINDS = ["text", "review"] as const;
export const PhraseKindSchema = z.enum(PHRASE_KINDS);
export type PhraseKind = z.infer<typeof PhraseKindSchema>;

export const PhraseBindingSchema = z.object({
  kind: PhraseKindSchema.default("text"),
  text: z.string().default(""),
  name: BindingNameSchema.optional(),
});
export type PhraseBinding = z.infer<typeof PhraseBindingSchema>;

// Ce que l'inspecteur demande au plugin : le catalogue, c'est-à-dire les valeurs qui s'appliquent et les expressions.
export const InspectorRequestSchema = z.object({ type: z.literal("catalogue") });
export type InspectorRequest = z.infer<typeof InspectorRequestSchema>;

// Ce que le plugin répond : le catalogue, ou pourquoi il n'a pas pu le lire (serveur éteint, réponse illisible).
export const CatalogueAnswerSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    values: z.record(z.string(), DeckValueSchema),
    expressions: z.array(ExpressionSummarySchema),
  }),
  z.object({ status: z.literal("down") }),
  z.object({ status: z.literal("to-restart") }),
]);
export type CatalogueAnswer = z.infer<typeof CatalogueAnswerSchema>;
