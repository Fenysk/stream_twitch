import { z } from "zod";
import { ChatAnimationSchema, ChatStyleSchema } from "./chat.schema";

type ScaleFields = {
  threshold: number;
  quietLevel?: number | undefined;
  quietScale?: number | undefined;
  loudScale?: number | undefined;
  loudLevel?: number | undefined;
};

type TalkFields = {
  talkMin?: number | undefined;
  talkMax?: number | undefined;
  talkAngle?: number | undefined;
};

type IdleFields = {
  idleMin?: number | undefined;
  idleMax?: number | undefined;
  idleAngle?: number | undefined;
  idleLift?: number | undefined;
};

const hasAllOrNoneOfScale = ({ quietLevel, quietScale, loudScale, loudLevel }: ScaleFields): boolean => {
  const given = [quietScale, loudScale, loudLevel].filter((value) => value !== undefined).length;
  return given === 3 || (given === 0 && quietLevel === undefined);
};

const hasAllOrNoneOfIdle = ({ idleMin, idleMax, idleAngle, idleLift }: IdleFields): boolean => {
  const given = [idleMin, idleMax, idleAngle, idleLift].filter((value) => value !== undefined).length;
  return given === 0 || given === 4;
};

const hasAllOrNoneOfTalk = ({ talkMin, talkMax, talkAngle }: TalkFields): boolean => {
  const given = [talkMin, talkMax, talkAngle].filter((value) => value !== undefined).length;
  return given === 0 || given === 3;
};

const isTalkMaxAboveMin = ({ talkMin, talkMax }: TalkFields): boolean =>
  talkMin === undefined || talkMax === undefined || talkMax >= talkMin;

const isIdleMaxAboveMin = ({ idleMin, idleMax }: IdleFields): boolean =>
  idleMin === undefined || idleMax === undefined || idleMax >= idleMin;

const isLoudLevelAboveQuiet = ({ threshold, quietLevel, loudLevel }: ScaleFields): boolean =>
  loudLevel === undefined || loudLevel > (quietLevel ?? threshold);

// Les messages sont lus dans l'interface : en français, et ils disent ce qui est attendu.
const NOT_A_NUMBER = "doit être un nombre";
const decibels = () =>
  z.number(NOT_A_NUMBER).min(-100, "doit être d'au moins -100 dB").max(0, "doit être d'au plus 0 dB");
const positive = () => z.number(NOT_A_NUMBER).positive("doit être supérieur à 0");
const positiveWhole = () => positive().int("doit être un nombre entier");
const nonNegative = () => z.number(NOT_A_NUMBER).min(0, "ne peut pas être négatif");

// Tous les réglages, un par champ. `strict` : une faute de frappe est refusée, pas ignorée.
export const SettingsFieldsSchema = z
  .object({
    obsAddress: z.string("doit être un texte").regex(/^wss?:\/\/.+/, "doit commencer par ws:// ou wss://"),
    micName: z.string("doit être un texte").min(1, "ne peut pas être vide"),
    threshold: decibels(),
    delay: positiveWhole(),
    rhythm: positiveWhole().optional(),
    tilt: nonNegative().optional(),
    opening: nonNegative().optional(),
    voiceEffect: z
      .number(NOT_A_NUMBER)
      .min(0, "doit être d'au moins 0 (0 %)")
      .max(1, "doit être d'au plus 1 (100 %)")
      .optional(),
    quietLevel: decibels().optional(),
    quietScale: positive().optional(),
    loudScale: positive().optional(),
    loudLevel: decibels().optional(),
    // L'expression active : l'identifiant d'une expression de data/heads/, absent pour la photo intégrée.
    expression: z
      .string("doit être un texte")
      .min(1, "ne peut pas être vide")
      .max(64, "64 caractères au plus")
      .optional(),
    idleMin: positive().optional(),
    idleMax: positive().optional(),
    idleAngle: nonNegative().optional(),
    idleLift: positive().optional(),
    // La tête entière change aussi de pose quand elle parle : mêmes quatre poses que le repos (la levée vient de idleLift),
    // un intervalle plus court, et un angle que l'interface règle.
    talkMin: positive().optional(),
    talkMax: positive().optional(),
    talkAngle: nonNegative().optional(),
    // Le tchat : la chaîne lue et les bots masqués restent dans settings.json ; les sept autres sont ceux de l'onglet « Tchat ».
    chatChannel: z
      .string("doit être un texte")
      .regex(/^[a-z0-9_]{1,25}$/, "doit être le nom d'une chaîne Twitch : minuscules, chiffres et _")
      .optional(),
    chatBots: z
      .array(z.string("doit être un texte").min(1, "ne peut pas être vide"), "doit être une liste de noms")
      .optional(),
    chatStyle: ChatStyleSchema.optional(),
    chatOpacity: z
      .number(NOT_A_NUMBER)
      .min(0, "doit être d'au moins 0 (0 %)")
      .max(100, "doit être d'au plus 100 (100 %)")
      .optional(),
    chatTextSize: z
      .number(NOT_A_NUMBER)
      .min(8, "doit être d'au moins 8 px")
      .max(120, "doit être d'au plus 120 px")
      .optional(),
    // En secondes ; 0 : les messages restent à l'écran.
    chatDuration: nonNegative().optional(),
    chatMaxMessages: positiveWhole().max(50, "doit être d'au plus 50").optional(),
    chatAnimation: ChatAnimationSchema.optional(),
    chatShouldShowHidden: z.boolean("doit être true ou false").optional(),
  })
  .strict();

// Format de `settings.json` une fois les valeurs locales ajoutées : les champs, et ce qu'ils exigent entre eux.
export const SettingsSchema = SettingsFieldsSchema.refine(hasAllOrNoneOfScale, {
  message:
    "quietScale, loudScale et loudLevel vont ensemble : tous les trois ou aucun (quietLevel les accompagne)",
})
  .refine(isLoudLevelAboveQuiet, {
    message: "loudLevel doit dépasser quietLevel (ou threshold quand il n'y a pas de quietLevel)",
    path: ["loudLevel"],
  })
  .refine(hasAllOrNoneOfIdle, {
    message: "idleMin, idleMax, idleAngle et idleLift vont ensemble : tous les quatre ou aucun",
  })
  .refine(isIdleMaxAboveMin, {
    message: "idleMax ne peut pas être plus petit que idleMin",
    path: ["idleMax"],
  })
  .refine(hasAllOrNoneOfTalk, {
    message: "talkMin, talkMax et talkAngle vont ensemble : tous les trois ou aucun",
  })
  .refine(isTalkMaxAboveMin, {
    message: "talkMax ne peut pas être plus petit que talkMin",
    path: ["talkMax"],
  });

export type Settings = z.infer<typeof SettingsSchema>;

// Les réglages que l'interface change : six curseurs de la tête, l'expression active et les sept réglages du tchat. Tous les
// autres (le micro, le délai, le rythme, les niveaux, les extrêmes de l'effet de la voix, l'intervalle et la levée du repos,
// l'adresse d'OBS, la chaîne et les bots du tchat) restent dans `settings.json` seulement.
export const EditableSettingsSchema = SettingsFieldsSchema.pick({
  threshold: true,
  tilt: true,
  opening: true,
  voiceEffect: true,
  idleAngle: true,
  talkAngle: true,
  expression: true,
  chatStyle: true,
  chatOpacity: true,
  chatTextSize: true,
  chatDuration: true,
  chatMaxMessages: true,
  chatAnimation: true,
  chatShouldShowHidden: true,
});
export type EditableSettings = z.infer<typeof EditableSettingsSchema>;

// `settings.local.json` : seulement les valeurs qu'Alexis a changées.
export const LocalSettingsSchema = EditableSettingsSchema.partial().strict();
export type LocalSettings = z.infer<typeof LocalSettingsSchema>;

// Ce que l'interface demande : une valeur par réglage, `null` pour revenir à la valeur par défaut de ce réglage.
export const SettingsChangesSchema = z.object({
  changes: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
});
export type SettingsChanges = z.infer<typeof SettingsChangesSchema>["changes"];

// Ce que le serveur dit à l'interface : les valeurs par défaut, les valeurs locales, et celles qui s'appliquent.
export const SettingsViewSchema = z.object({
  defaults: EditableSettingsSchema,
  local: LocalSettingsSchema,
  effective: EditableSettingsSchema,
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;

// Un refus du serveur : le réglage fautif (vide pour une règle entre plusieurs) et ce qui est attendu.
export const SettingsIssueSchema = z.object({ path: z.string(), message: z.string() });
export type SettingsIssue = z.infer<typeof SettingsIssueSchema>;
export const SettingsRefusalSchema = z.object({ issues: z.array(SettingsIssueSchema) });
