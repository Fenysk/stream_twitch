import { z } from "zod";
import { ChatAnimationSchema, ChatStyleSchema } from "./chat.schema";
import { toPronunciation } from "./pronunciation.rules";
import { toEmoteReaction } from "./reaction.rules";

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
  foxLateYawnMin?: number | undefined;
  foxLateYawnMax?: number | undefined;
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
  "foxEmoteReactions",
  "foxAwayAfter",
  "foxCrouchDuration",
  "foxJumpDuration",
  "foxDiveDuration",
  "foxReturnDuration",
  "foxYawnDuration",
  "foxRaidDuration",
  "foxJabAfter",
  "foxJabGap",
  "foxJabs",
  "foxReminders",
  "foxShoutThreshold",
  "foxShoutMerge",
  "foxShoutCount",
  "foxShoutPeriod",
  "foxShoutLong",
  "foxShoutGap",
  "foxShouts",
  "foxTunnelAfter",
  "foxTunnelPause",
  "foxTunnelGap",
  "foxTunnelToFenysk",
  "foxTunnelToChat",
  "foxShouldHailComeback",
  "foxComebackAfter",
  "foxComebackToFenysk",
  "foxComebackToChat",
  "foxBalanceMargin",
  "foxBalanceAfter",
  "foxBalanceGap",
  "foxBalanceAlerts",
  "foxStartleRise",
  "foxStartleWithin",
  "foxStartleLevel",
  "foxStartleGap",
  "foxHourPhrases",
  "foxEndTime",
  "foxEndWarningMarks",
  "foxEndWarningPhrases",
  "foxEndSoonPhrases",
  "foxEndPanicPhrases",
  "foxEndPhrases",
  "foxOvertimeGap",
  "foxOvertimePhrases",
  "foxBedtimePhrases",
  "foxLateAfter",
  "foxLateYawnMin",
  "foxLateYawnMax",
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
  "foxThanksLurk",
  "foxThanksLurkGeneric",
  "foxTalkativeMessages",
  "foxThanksTalkative",
  "foxThanksRaid",
  "foxThanksRaidGeneric",
  "foxClashRewards",
  "foxClashIntros",
  "foxWakeRewards",
  "foxThanksWakeAsleep",
  "foxThanksWakeAwake",
  "foxThanksPrediction",
  "foxThanksPredictionNoLoser",
  "foxShouldReviewAtEnd",
  "foxShouldWelcome",
  "foxWelcomeLiveGap",
  "foxWelcomeLiveCounts",
  "foxWelcomeReturnAfter",
  "foxWelcomeMilestone",
  "foxWelcomeReturn",
  "foxWelcomeYesterday",
  "foxWelcomeFirst",
  "foxCheerfulCount",
  "foxCheerfulPeriod",
  "foxSulkAfter",
  "foxResumeAfter",
  "foxResumePhrases",
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

const isFoxLateYawnMaxAboveMin = ({ foxLateYawnMin, foxLateYawnMax }: FoxFields): boolean =>
  foxLateYawnMin === undefined || foxLateYawnMax === undefined || foxLateYawnMax >= foxLateYawnMin;

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
// Une heure du jour, « HH:MM » de 00:00 à 23:59 ; `orEmpty` : le texte vide est permis (pas d'heure).
const clockTime = (orEmpty: boolean) =>
  z
    .string("doit être un texte")
    .regex(
      orEmpty ? /^(?:(?:[01]\d|2[0-3]):[0-5]\d)?$/ : /^(?:[01]\d|2[0-3]):[0-5]\d$/,
      orEmpty
        ? "doit s'écrire HH:MM (de 00:00 à 23:59), ou rester vide"
        : "doit s'écrire HH:MM (de 00:00 à 23:59)",
    );
// Une liste de nombres entiers positifs, un par ligne (écrits en texte, comme le champ multiligne qui les change).
const wholeNumberList = (unit: string) =>
  z.array(
    z
      .string("doit être un texte")
      .regex(/^[1-9]\d{0,5}$/, `chaque ligne doit être un nombre entier de ${unit}, 1 ou plus`),
    "doit être une liste de nombres",
  );
// Un écart entre deux levels, en dB : positif ou négatif.
const decibelGap = () =>
  z.number(NOT_A_NUMBER).min(-20, "doit être d'au moins -20 dB").max(20, "doit être d'au plus 20 dB");

// Tous les réglages, un par champ. `strict` : une faute de frappe est refusée, pas ignorée.
export const SettingsFieldsSchema = z
  .object({
    obsAddress: z.string("doit être un texte").regex(/^wss?:\/\/.+/, "doit commencer par ws:// ou wss://"),
    micName: z.string("doit être un texte").min(1, "ne peut pas être vide"),
    // La source OBS du son du PC, comme le micro : choisie dans settings.json. Absente, le renard ne compare pas.
    desktopName: z.string("doit être un texte").min(1, "ne peut pas être vide").optional(),
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
    // Les emotes qui changent sa tête : une ligne par emote, « nom exact = sourire, choc ou clin ».
    foxEmoteReactions: z
      .array(
        z
          .string("doit être un texte")
          .refine(
            (line) => toEmoteReaction(line) !== null,
            "doit s'écrire « nom de l'emote = sourire, choc ou clin »",
          ),
        "doit être une liste de lignes",
      )
      .optional(),
    foxAwayAfter: positiveWhole().optional(),
    foxCrouchDuration: positiveWhole().optional(),
    foxJumpDuration: positiveWhole().optional(),
    foxDiveDuration: positiveWhole().optional(),
    foxReturnDuration: positiveWhole().optional(),
    foxYawnDuration: positiveWhole().optional(),
    // Le long coucou d'un raid (ms) : les deux images du coucou alternent pendant ce temps avant la phrase.
    foxRaidDuration: positiveWhole().optional(),
    // La relance : le silence total (ms) après lequel le renard caché revient piquer Fenysk, l'écart (ms) entre deux piques, et
    // les piques, une phrase par entrée.
    foxJabAfter: positiveWhole().optional(),
    foxJabGap: positiveWhole().optional(),
    foxJabs: phraseList(false).optional(),
    // Les rappels du silence de la relance, tournés vers le tchat, une phrase par entrée : ils alternent avec les piques.
    foxReminders: phraseList(false).optional(),
    // Le cri : le level du mic (dB) au-dessus duquel Fenysk crie, l'écart (ms) sous lequel deux passages font un seul cri, puis
    // ce qui est pénible : ce nombre de cris dans cette période (ms), ou un cri de plus de cette durée (ms). Au plus une
    // phrase de cri par écart (ms) ; les phrases, une par entrée.
    foxShoutThreshold: decibels().optional(),
    foxShoutMerge: positiveWhole().optional(),
    foxShoutCount: positiveWhole().optional(),
    foxShoutPeriod: positiveWhole().optional(),
    foxShoutLong: positiveWhole().optional(),
    foxShoutGap: positiveWhole().optional(),
    foxShouts: phraseList(false).optional(),
    // Le tunnel : Fenysk parle depuis cette durée (ms) sans silence de plus de cette pause (ms) ; au plus un par écart (ms) ;
    // les phrases tournées vers lui, et celles tournées vers le tchat.
    foxTunnelAfter: positiveWhole().optional(),
    foxTunnelPause: positiveWhole().optional(),
    foxTunnelGap: positiveWhole().optional(),
    foxTunnelToFenysk: phraseList(false).optional(),
    foxTunnelToChat: phraseList(false).optional(),
    // Le retour de Fenysk : la case « Saluer mon retour », le silence de sa voix (ms, mic coupé compris) qui fait une absence, et
    // les phrases tournées vers lui, et celles tournées vers le tchat ({absence} : la durée dite).
    foxShouldHailComeback: z.boolean("doit être true ou false").optional(),
    foxComebackAfter: positiveWhole().optional(),
    foxComebackToFenysk: phraseList(false).optional(),
    foxComebackToChat: phraseList(false).optional(),
    // La balance du son : l'écart toléré du desktop sur la voix (dB), la durée de parole cumulée (ms) où il la couvre avant
    // d'alerter, l'écart (ms) entre deux alertes, et les phrases d'alerte.
    foxBalanceMargin: decibelGap().optional(),
    foxBalanceAfter: positiveWhole().optional(),
    foxBalanceGap: positiveWhole().optional(),
    foxBalanceAlerts: phraseList(false).optional(),
    // Le sursaut du jeu : la hausse (dB) du son du PC, en moins de ce temps (ms), jusqu'au-dessus de ce level (dB) ; au plus un
    // sursaut par écart (ms).
    foxStartleRise: positive().max(100, "doit être d'au plus 100 dB").optional(),
    foxStartleWithin: positiveWhole().optional(),
    foxStartleLevel: decibels().optional(),
    foxStartleGap: positiveWhole().optional(),
    // L'heure du live : les phrases de chaque heure pleine ; la fin prévue (« HH:MM », vide : pas de fin prévue), les paliers où il
    // prévient (un nombre de minutes avant elle par ligne), les phrases de ses trois tons (calme, pressant, paniqué), celles de la
    // fin, l'écart (ms) entre deux rappels après elle, leurs phrases, la phrase du coucher ; puis l'heure (« HH:MM ») après
    // laquelle il bâille sans fin prévue, et l'écart (ms) entre deux bâillements.
    foxHourPhrases: phraseList(false).optional(),
    foxEndTime: clockTime(true).optional(),
    foxEndWarningMarks: wholeNumberList("minutes").optional(),
    foxEndWarningPhrases: phraseList(false).optional(),
    foxEndSoonPhrases: phraseList(false).optional(),
    foxEndPanicPhrases: phraseList(false).optional(),
    foxEndPhrases: phraseList(false).optional(),
    foxOvertimeGap: positiveWhole().optional(),
    foxOvertimePhrases: phraseList(false).optional(),
    foxBedtimePhrases: phraseList(false).optional(),
    foxLateAfter: clockTime(false).optional(),
    foxLateYawnMin: positiveWhole().optional(),
    foxLateYawnMax: positiveWhole().optional(),
    // Le bilan du live : dit tout seul juste après l'annonce de la fin prévue (la case « Bilan à la fin prévue »).
    foxShouldReviewAtEnd: z.boolean("doit être true ou false").optional(),
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
    foxThanksLurk: phraseList(true).optional(),
    foxThanksLurkGeneric: phraseList(true).optional(),
    // Un viewer très impliqué : le nombre de messages acceptés depuis le démarrage du serveur qui lui vaut un remerciement (une
    // fois), et ses phrases.
    foxTalkativeMessages: positiveWhole().optional(),
    foxThanksTalkative: phraseList(true).optional(),
    // Un raid : la phrase dite au tchat avec le nombre de viewers, et celle d'un pseudo refusé.
    foxThanksRaid: phraseList(true).optional(),
    foxThanksRaidGeneric: phraseList(true).optional(),
    // Les récompenses de points de chaîne, reconnues par leur titre (une liste vide : ignorées) : « Clasher Fenysk » (une pique
    // tout de suite, précédée d'une phrase d'intro) et « Réveiller Jean-Renard » (une phrase selon qu'il dormait ou non).
    foxClashRewards: phraseList(false).optional(),
    foxClashIntros: phraseList(true).optional(),
    foxWakeRewards: phraseList(false).optional(),
    foxThanksWakeAsleep: phraseList(true).optional(),
    foxThanksWakeAwake: phraseList(true).optional(),
    // Une prédiction terminée : la phrase dite au tchat avec les perdants et l'issue qu'ils ont choisie, et celle de personne.
    foxThanksPrediction: phraseList(true).optional(),
    foxThanksPredictionNoLoser: phraseList(true).optional(),
    // Les habitués : la case « Accueillir les habitués », le silence (ms) d'un viewer au-delà duquel il commence un live de plus,
    // les nombres de lives qui ont un palier (un nombre par ligne), l'absence (ms) à partir de laquelle il « revient », et les
    // phrases de chaque cas (une liste vide : ce cas ne dit rien).
    foxShouldWelcome: z.boolean("doit être true ou false").optional(),
    foxWelcomeLiveGap: positiveWhole().optional(),
    foxWelcomeLiveCounts: wholeNumberList("lives").optional(),
    foxWelcomeReturnAfter: positiveWhole().optional(),
    foxWelcomeMilestone: phraseList(false).optional(),
    foxWelcomeReturn: phraseList(false).optional(),
    foxWelcomeYesterday: phraseList(false).optional(),
    foxWelcomeFirst: phraseList(false).optional(),
    // Son humeur selon le tchat : joyeux à ce nombre de messages acceptés dans cette période (ms) ; boudeur après ce silence du
    // tchat (ms) ; la reprise (une phrase avant le premier message accepté) après ce silence (ms), et ses phrases.
    foxCheerfulCount: positiveWhole().optional(),
    foxCheerfulPeriod: positiveWhole().optional(),
    foxSulkAfter: positiveWhole().optional(),
    foxResumeAfter: positiveWhole().optional(),
    foxResumePhrases: phraseList(false).optional(),
    // La prononciation : une ligne par mot, « abréviation = forme dite », appliquée à tout ce qu'il dit avant la synthèse.
    foxPronunciations: z
      .array(
        z
          .string("doit être un texte")
          .refine((line) => toPronunciation(line) !== null, "doit s'écrire « abréviation = forme dite »"),
        "doit être une liste de lignes",
      )
      .optional(),
    // Le tchat : la chaîne lue reste dans settings.json ; les bots (comptes ignorés) se règlent dans l'onglet « Renard », les sept autres dans « Tchat ».
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
  })
  .refine(isFoxLateYawnMaxAboveMin, {
    message: "foxLateYawnMax ne peut pas être plus petit que foxLateYawnMin",
    path: ["foxLateYawnMax"],
  });

export type Settings = z.infer<typeof SettingsSchema>;

// Les réglages que l'interface change : six curseurs de la tête, l'expression active, ceux du renard (sa liste d'emotes reste dans settings.json), les sept du
// tchat et les comptes ignorés (onglet « Renard »). Tous les autres (le micro, le délai, le rythme, les niveaux, les extrêmes de
// l'effet de la voix, l'intervalle et la levée du repos, l'adresse d'OBS, la chaîne du tchat) restent dans `settings.json` seulement.
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
  foxEmoteReactions: true,
  foxAwayAfter: true,
  foxCrouchDuration: true,
  foxJumpDuration: true,
  foxDiveDuration: true,
  foxReturnDuration: true,
  foxYawnDuration: true,
  foxRaidDuration: true,
  foxJabAfter: true,
  foxJabGap: true,
  foxJabs: true,
  foxReminders: true,
  foxShoutThreshold: true,
  foxShoutMerge: true,
  foxShoutCount: true,
  foxShoutPeriod: true,
  foxShoutLong: true,
  foxShoutGap: true,
  foxShouts: true,
  foxTunnelAfter: true,
  foxTunnelPause: true,
  foxTunnelGap: true,
  foxTunnelToFenysk: true,
  foxTunnelToChat: true,
  foxShouldHailComeback: true,
  foxComebackAfter: true,
  foxComebackToFenysk: true,
  foxComebackToChat: true,
  foxBalanceMargin: true,
  foxBalanceAfter: true,
  foxBalanceGap: true,
  foxBalanceAlerts: true,
  foxStartleRise: true,
  foxStartleWithin: true,
  foxStartleLevel: true,
  foxStartleGap: true,
  foxHourPhrases: true,
  foxEndTime: true,
  foxEndWarningMarks: true,
  foxEndWarningPhrases: true,
  foxEndSoonPhrases: true,
  foxEndPanicPhrases: true,
  foxEndPhrases: true,
  foxOvertimeGap: true,
  foxOvertimePhrases: true,
  foxBedtimePhrases: true,
  foxLateAfter: true,
  foxLateYawnMin: true,
  foxLateYawnMax: true,
  foxShouldReviewAtEnd: true,
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
  foxThanksLurk: true,
  foxThanksLurkGeneric: true,
  foxTalkativeMessages: true,
  foxThanksTalkative: true,
  foxThanksRaid: true,
  foxThanksRaidGeneric: true,
  foxClashRewards: true,
  foxClashIntros: true,
  foxWakeRewards: true,
  foxThanksWakeAsleep: true,
  foxThanksWakeAwake: true,
  foxThanksPrediction: true,
  foxThanksPredictionNoLoser: true,
  foxShouldWelcome: true,
  foxWelcomeLiveGap: true,
  foxWelcomeLiveCounts: true,
  foxWelcomeReturnAfter: true,
  foxWelcomeMilestone: true,
  foxWelcomeReturn: true,
  foxWelcomeYesterday: true,
  foxWelcomeFirst: true,
  foxCheerfulCount: true,
  foxCheerfulPeriod: true,
  foxSulkAfter: true,
  foxResumeAfter: true,
  foxResumePhrases: true,
  chatBots: true,
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
