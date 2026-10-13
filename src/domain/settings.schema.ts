import { z } from "zod";
import { ChatAnimationSchema, ChatStyleSchema } from "./chat.schema";
import { toPronunciation } from "./pronunciation.rules";

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

// Les nombres du renard que les règles entre réglages comparent.
type FoxFields = {
  foxSmallThreshold?: number | undefined;
  foxMediumThreshold?: number | undefined;
  foxGazeMin?: number | undefined;
  foxGazeMax?: number | undefined;
  foxBlinkMin?: number | undefined;
  foxBlinkMax?: number | undefined;
  foxListenMin?: number | undefined;
  foxListenMax?: number | undefined;
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

// Les réglages du renard, qui vont ensemble : sa voix, les nombres de ses règles, ceux de la lecture du tchat et ceux de D, E,
// F, G et H (il écoute, il réagit, il bâille, il fait coucou, il s'en va et revient). Un test retire chacun d'eux pour
// vérifier cette liste.
const FOX_KEYS: readonly string[] = [
  "foxVoice",
  "foxSmallThreshold",
  "foxMediumThreshold",
  "foxLargeChance",
  "foxBounce",
  "foxBreathPeriod",
  "foxBreath",
  "foxGazeMin",
  "foxGazeMax",
  "foxBlinkMin",
  "foxBlinkMax",
  "foxBlinkDuration",
  "foxShouldReadChat",
  "foxShouldReadOwn",
  "foxReadMaxLength",
  "foxReadGap",
  "foxReadQueueSize",
  "foxCapitalsMaxLength",
  "foxReadMaxWait",
  "foxEmoteNames",
  "foxListenMin",
  "foxListenMax",
  "foxReadSilence",
  "foxStopAfter",
  "foxReactionDuration",
  "foxAwayAfter",
  "foxCrouchDuration",
  "foxJumpDuration",
  "foxDiveDuration",
  "foxReturnDuration",
  "foxYawnDuration",
  "foxJabAfter",
  "foxJabGap",
  "foxJabs",
  "foxPronunciations",
  "foxJoyDuration",
  "foxShouldThank",
  "foxThankGap",
  "foxThanksFollow",
  "foxThanksFollowGeneric",
  "foxThanksSub",
  "foxThanksGiftOne",
  "foxThanksGiftMany",
  "foxThanksCheer",
];

const hasAllOrNoneOfFox = (fields: Readonly<Record<string, unknown>>): boolean => {
  const given = FOX_KEYS.filter((key) => fields[key] !== undefined).length;
  return given === 0 || given === FOX_KEYS.length;
};

const isFoxMediumAboveSmall = ({ foxSmallThreshold, foxMediumThreshold }: FoxFields): boolean =>
  foxSmallThreshold === undefined ||
  foxMediumThreshold === undefined ||
  foxMediumThreshold > foxSmallThreshold;

const isFoxGazeMaxAboveMin = ({ foxGazeMin, foxGazeMax }: FoxFields): boolean =>
  foxGazeMin === undefined || foxGazeMax === undefined || foxGazeMax >= foxGazeMin;

const isFoxListenMaxAboveMin = ({ foxListenMin, foxListenMax }: FoxFields): boolean =>
  foxListenMin === undefined || foxListenMax === undefined || foxListenMax >= foxListenMin;

const isFoxBlinkMaxAboveMin = ({ foxBlinkMin, foxBlinkMax }: FoxFields): boolean =>
  foxBlinkMin === undefined || foxBlinkMax === undefined || foxBlinkMax >= foxBlinkMin;

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
// Une liste de phrases, une par entrée ; `needsOne` : au moins une (un remerciement sans phrase ne se dit pas).
const phraseList = (needsOne: boolean) => {
  const phrases = z.array(
    z.string("doit être un texte").min(1, "ne peut pas être vide"),
    "doit être une liste de phrases",
  );
  return needsOne ? phrases.min(1, "doit avoir au moins une phrase") : phrases;
};
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
    // Le renard : sa voix (le nom d'une voix de Windows) et ses règles. La source OBS laisse 96 px au-dessus de lui (11,7 %
    // de sa hauteur) : la respiration (3 % au plus) et le rebond (8 % au plus) y tiennent.
    foxVoice: z
      .string("doit être un texte")
      .min(1, "ne peut pas être vide")
      .max(64, "64 caractères au plus")
      .optional(),
    foxSmallThreshold: decibels().optional(),
    foxMediumThreshold: decibels().optional(),
    foxLargeChance: z
      .number(NOT_A_NUMBER)
      .min(0, "doit être d'au moins 0 (0 %)")
      .max(1, "doit être d'au plus 1 (100 %)")
      .optional(),
    foxBounce: nonNegative().max(0.08, "doit être d'au plus 0,08 (8 %)").optional(),
    foxBreathPeriod: positiveWhole().optional(),
    foxBreath: nonNegative().max(0.03, "doit être d'au plus 0,03 (3 %)").optional(),
    foxGazeMin: positive().optional(),
    foxGazeMax: positive().optional(),
    foxBlinkMin: positive().optional(),
    foxBlinkMax: positive().optional(),
    foxBlinkDuration: positive().optional(),
    // La lecture du tchat : deux interrupteurs, la longueur d'un message (un message du tchat tient dans 500 caractères), le
    // temps en ms avant de relire un même viewer, la taille de la file, et les noms des emotes de 7TV, BTTV et FFZ.
    foxShouldReadChat: z.boolean("doit être true ou false").optional(),
    foxShouldReadOwn: z.boolean("doit être true ou false").optional(),
    foxReadMaxLength: positiveWhole().max(500, "doit être d'au plus 500 caractères").optional(),
    foxReadGap: positiveWhole().optional(),
    foxReadQueueSize: positiveWhole().max(20, "doit être d'au plus 20 messages").optional(),
    // Un message de cette longueur (en caractères) ou moins passe la règle des majuscules : « GG », « JEANRENARD ».
    foxCapitalsMaxLength: positiveWhole().max(500, "doit être d'au plus 500 caractères").optional(),
    // Le temps en ms qu'un message accepté peut attendre dans la queue ; au-delà, il n'est plus lu.
    foxReadMaxWait: positiveWhole().optional(),
    foxEmoteNames: z
      .array(z.string("doit être un texte").min(1, "ne peut pas être vide"), "doit être une liste de noms")
      .optional(),
    // Il écoute Alexis : le temps en ms entre deux regards, le silence avant de lire, la parole qui coupe la lecture. Puis la
    // durée d'une réaction et du coucou, le silence qui l'ennuie, et son bâillement (tout en ms).
    foxListenMin: positive().optional(),
    foxListenMax: positive().optional(),
    foxReadSilence: positiveWhole().optional(),
    foxStopAfter: positiveWhole().optional(),
    foxReactionDuration: positiveWhole().optional(),
    foxAwayAfter: positiveWhole().optional(),
    foxCrouchDuration: positiveWhole().optional(),
    foxJumpDuration: positiveWhole().optional(),
    foxDiveDuration: positiveWhole().optional(),
    foxReturnDuration: positiveWhole().optional(),
    foxYawnDuration: positiveWhole().optional(),
    // La relance : le silence total (ms) après lequel le renard caché revient piquer Fenysk, l'écart (ms) entre deux piques, et
    // les piques, une phrase par entrée.
    foxJabAfter: positiveWhole().optional(),
    foxJabGap: positiveWhole().optional(),
    foxJabs: phraseList(false).optional(),
    // Les remerciements : la durée du saut de joie d'un sub (ms), la case « Remercier les follows, subs et cheers », le délai
    // (ms) entre deux remerciements nominatifs de follow, et les phrases de chaque sorte d'évènement.
    foxJoyDuration: positiveWhole().optional(),
    foxShouldThank: z.boolean("doit être true ou false").optional(),
    foxThankGap: positiveWhole().optional(),
    foxThanksFollow: phraseList(true).optional(),
    foxThanksFollowGeneric: phraseList(true).optional(),
    foxThanksSub: phraseList(true).optional(),
    foxThanksGiftOne: phraseList(true).optional(),
    foxThanksGiftMany: phraseList(true).optional(),
    foxThanksCheer: phraseList(true).optional(),
    // La prononciation : une ligne par mot, « abréviation = forme dite », appliquée à tout ce qu'il dit avant la synthèse.
    foxPronunciations: z
      .array(
        z
          .string("doit être un texte")
          .refine((line) => toPronunciation(line) !== null, "doit s'écrire « abréviation = forme dite »"),
        "doit être une liste de lignes",
      )
      .optional(),
    // Le tchat : la chaîne lue et les bots masqués restent dans settings.json ; les sept autres sont ceux de l'onglet « Tchat ».
    chatChannel: z
      .string("doit être un texte")
      .regex(/^[a-z0-9_]{1,25}$/, "doit être le nom d'une chaîne Twitch : minuscules, chiffres et _")
      .optional(),
    // L'identifiant numérique de la chaîne sur Twitch : 7TV et BTTV cherchent les emotes d'une chaîne par lui.
    chatChannelId: z
      .string("doit être un texte")
      .regex(/^[0-9]{1,20}$/, "doit être l'identifiant numérique de la chaîne Twitch (des chiffres)")
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
  })
  .refine(hasAllOrNoneOfFox, {
    message: "les réglages fox* vont ensemble : tous ou aucun",
  })
  .refine(isFoxMediumAboveSmall, {
    message: "foxMediumThreshold doit dépasser foxSmallThreshold",
    path: ["foxMediumThreshold"],
  })
  .refine(isFoxGazeMaxAboveMin, {
    message: "foxGazeMax ne peut pas être plus petit que foxGazeMin",
    path: ["foxGazeMax"],
  })
  .refine(isFoxListenMaxAboveMin, {
    message: "foxListenMax ne peut pas être plus petit que foxListenMin",
    path: ["foxListenMax"],
  })
  .refine(isFoxBlinkMaxAboveMin, {
    message: "foxBlinkMax ne peut pas être plus petit que foxBlinkMin",
    path: ["foxBlinkMax"],
  });

export type Settings = z.infer<typeof SettingsSchema>;

// Les réglages que l'interface change : six curseurs de la tête, l'expression active, ceux du renard (sa liste d'emotes reste dans settings.json) et les sept du
// tchat. Tous les autres (le micro, le délai, le rythme, les niveaux, les extrêmes de l'effet de la voix, l'intervalle et la
// levée du repos, l'adresse d'OBS, la chaîne et les bots du tchat) restent dans `settings.json` seulement.
export const EditableSettingsSchema = SettingsFieldsSchema.pick({
  threshold: true,
  tilt: true,
  opening: true,
  voiceEffect: true,
  idleAngle: true,
  talkAngle: true,
  expression: true,
  foxVoice: true,
  foxSmallThreshold: true,
  foxMediumThreshold: true,
  foxLargeChance: true,
  foxBounce: true,
  foxBreathPeriod: true,
  foxBreath: true,
  foxGazeMin: true,
  foxGazeMax: true,
  foxBlinkMin: true,
  foxBlinkMax: true,
  foxBlinkDuration: true,
  foxShouldReadChat: true,
  foxShouldReadOwn: true,
  foxReadMaxLength: true,
  foxReadGap: true,
  foxReadQueueSize: true,
  foxCapitalsMaxLength: true,
  foxReadMaxWait: true,
  foxListenMin: true,
  foxListenMax: true,
  foxReadSilence: true,
  foxStopAfter: true,
  foxReactionDuration: true,
  foxAwayAfter: true,
  foxCrouchDuration: true,
  foxJumpDuration: true,
  foxDiveDuration: true,
  foxReturnDuration: true,
  foxYawnDuration: true,
  foxJabAfter: true,
  foxJabGap: true,
  foxJabs: true,
  foxPronunciations: true,
  foxJoyDuration: true,
  foxShouldThank: true,
  foxThankGap: true,
  foxThanksFollow: true,
  foxThanksFollowGeneric: true,
  foxThanksSub: true,
  foxThanksGiftOne: true,
  foxThanksGiftMany: true,
  foxThanksCheer: true,
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
  changes: z.record(
    z.string(),
    z.union([z.number(), z.string(), z.boolean(), z.array(z.string()), z.null()]),
  ),
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
