import { z } from "zod";

// Les formats de fichier audio acceptés ; le type se lit dans les premiers octets, jamais dans l'extension.
export const AUDIO_FORMATS = ["mp3", "wav", "ogg"] as const;
export const AudioFormatSchema = z.enum(AUDIO_FORMATS);
export type AudioFormat = z.infer<typeof AudioFormatSchema>;

// Les bornes d'un son : le titre est celui de la récompense Twitch (45 caractères, unique sur la chaîne) ; la pace va de 0
// (aucune) à 7 jours, le plus long cooldown que Twitch accepte.
export const SOUND_LIMITS = {
  titleMax: 45,
  paceMax: 604_800,
  faderMax: 100,
  fileMaxBytes: 5 * 1024 * 1024,
} as const;

// Ce que le formulaire propose au départ : 100 points, une pace de 30 s, un fader à 80 %.
export const SOUND_DEFAULTS = { cost: 100, pace: 30, fader: 80 } as const;

// Les réglages d'un sound, sans son fichier. `pace` : des secondes (0 = aucune) ; `fader` : un pourcentage.
export const SoundFieldsSchema = z.object({
  title: z
    .string("le titre doit être un texte")
    .trim()
    .min(1, "le titre ne peut pas être vide")
    .max(SOUND_LIMITS.titleMax, `le titre fait ${SOUND_LIMITS.titleMax} caractères au plus`),
  cost: z
    .number("le coût doit être un nombre")
    .int("le coût est un nombre entier")
    .min(1, "le coût vaut 1 point au moins"),
  pace: z
    .number("la pace doit être un nombre")
    .int("la pace est un nombre entier de secondes")
    .min(0, "la pace ne peut pas être négative")
    .max(SOUND_LIMITS.paceMax, `la pace fait ${SOUND_LIMITS.paceMax} secondes au plus (7 jours)`),
  fader: z
    .number("le volume doit être un nombre")
    .int("le volume est un nombre entier")
    .min(0, "le volume ne peut pas être négatif")
    .max(SOUND_LIMITS.faderMax, "le volume fait 100 % au plus"),
});
export type SoundFields = z.infer<typeof SoundFieldsSchema>;

// Le sound.json d'un son : ses réglages, le format de son fichier audio, l'identifiant de son reward sur Twitch (`null` : il
// n'en a pas encore, comme un son d'avant les récompenses) et `isManaged` : l'app a créé ce reward et le gère (elle le modifie,
// le supprime, le met en pause, marque ses rachats). Faux : Alexis l'a fait sur Twitch, l'app ne fait que le lire ; ses titre,
// coût et pace sont ceux de Twitch. Absent (un son d'avant), c'est vrai.
export const SoundFileSchema = SoundFieldsSchema.extend({
  format: AudioFormatSchema,
  rewardId: z.string().min(1).nullable().default(null),
  isManaged: z.boolean().default(true),
});
export type SoundFile = z.infer<typeof SoundFileSchema>;

// Ce que l'interface envoie pour créer ou modifier un son : les réglages et le fichier audio en base64. Le fichier manque à
// la modification quand on garde l'ancien. `rewardId` (à la création seulement) : relier le son à ce reward déjà fait sur
// Twitch au lieu d'en créer un ; le serveur en relit alors le titre, le coût et la pace sur Twitch.
export const SoundInputSchema = SoundFieldsSchema.extend({
  file: z.string().min(1).optional(),
  rewardId: z.string().min(1).optional(),
});
export type SoundInput = z.infer<typeof SoundInputSchema>;

// Un son tel que les pages le voient. `version` change à chaque écriture : l'adresse de son fichier change avec elle.
// `hasReward` : il a un reward (l'identifiant du reward ne quitte pas le serveur). `isManaged` : l'app gère ce reward.
export const SoundSummarySchema = SoundFieldsSchema.extend({
  id: z.string().min(1),
  version: z.string().min(1),
  hasReward: z.boolean(),
  isManaged: z.boolean(),
});
export type SoundSummary = z.infer<typeof SoundSummarySchema>;

export const SoundListSchema = z.object({ sounds: z.array(SoundSummarySchema) });

// Un reward de la chaîne que Twitch connaît, à relier à un son : son identifiant, son titre, son coût, sa pace (le cooldown
// global en secondes, 0 = aucun) et si l'app peut le gérer (elle l'a créé).
export const RewardChoiceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  cost: z.number().int().min(0),
  pace: z.number().int().min(0),
  isManageable: z.boolean(),
});
export type RewardChoice = z.infer<typeof RewardChoiceSchema>;

// Les rewards de la chaîne qui n'ont pas encore de son (`choices`), et les sons dont le reward a disparu de Twitch (`missing`,
// leurs identifiants).
export const RewardChoicesSchema = z.object({
  choices: z.array(RewardChoiceSchema),
  missing: z.array(z.string()),
});
export type RewardChoices = z.infer<typeof RewardChoicesSchema>;

// Ce que le serveur envoie à la page /sounds : un son à jouer (le `playId` revient dans sa réponse), ou l'ordre de se taire.
export const SoundEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("play"),
    playId: z.string().min(1),
    soundId: z.string().min(1),
    version: z.string().min(1),
    fader: z.number().min(0).max(SOUND_LIMITS.faderMax),
  }),
  z.object({ kind: z.literal("stop") }),
]);
export type SoundEvent = z.infer<typeof SoundEventSchema>;

// La réponse de la page /sounds quand un son a fini (`ended`) ou n'a pas pu jouer (`failed`, avec la raison).
export const SoundOutcomeSchema = z.object({
  playId: z.string().min(1),
  outcome: z.enum(["ended", "failed"]),
  reason: z.string().max(200).optional(),
});
export type SoundOutcome = z.infer<typeof SoundOutcomeSchema>;

// Un refus d'un sound : l'élément fautif (vide pour une panne) et ce qui est attendu.
export type SoundIssue = { path: string; message: string };
