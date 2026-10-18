import { z } from "zod";

// Les formats de fichier audio acceptés ; le type se lit dans les premiers octets, jamais dans l'extension.
export const AUDIO_FORMATS = ["mp3", "wav", "ogg"] as const;
export const AudioFormatSchema = z.enum(AUDIO_FORMATS);
export type AudioFormat = z.infer<typeof AudioFormatSchema>;

// Les bornes d'un sound : un titre de 45 caractères au plus (unique parmi les sounds), un fader de 0 à 100 %, un fichier de 5 Mo.
export const SOUND_LIMITS = {
  titleMax: 45,
  faderMax: 100,
  fileMaxBytes: 5 * 1024 * 1024,
} as const;

// Ce que le formulaire propose au départ : un fader à 80 %.
export const SOUND_DEFAULTS = { fader: 80 } as const;

// Les réglages d'un sound, sans son fichier. `fader` : un pourcentage.
export const SoundFieldsSchema = z.object({
  title: z
    .string("le titre doit être un texte")
    .trim()
    .min(1, "le titre ne peut pas être vide")
    .max(SOUND_LIMITS.titleMax, `le titre fait ${SOUND_LIMITS.titleMax} caractères au plus`),
  fader: z
    .number("le volume doit être un nombre")
    .int("le volume est un nombre entier")
    .min(0, "le volume ne peut pas être négatif")
    .max(SOUND_LIMITS.faderMax, "le volume fait 100 % au plus"),
});
export type SoundFields = z.infer<typeof SoundFieldsSchema>;

// Le sound.json d'un sound : ses réglages et le format de son fichier audio. Son reward n'y est pas : il se garde du côté du reward
// (data/rewards.json).
export const SoundFileSchema = SoundFieldsSchema.extend({ format: AudioFormatSchema });
export type SoundFile = z.infer<typeof SoundFileSchema>;

// Un sound.json d'avant, qui portait aussi le coût, la pace, le reward (`rewardId`) et `isManaged` : l'app a créé ce reward et le
// gère. Lu une fois au démarrage, pour en faire un enregistrement de data/rewards.json (`isManaged` absent : vrai).
export const LegacySoundFileSchema = SoundFileSchema.extend({
  cost: z.number().optional(),
  pace: z.number().optional(),
  rewardId: z.string().min(1).nullable().optional(),
  isManaged: z.boolean().optional(),
});
export type LegacySoundFile = z.infer<typeof LegacySoundFileSchema>;

// Ce que l'interface envoie pour créer ou modifier un sound : les réglages et le fichier audio en base64. Le fichier manque à la
// modification quand on garde l'ancien.
export const SoundInputSchema = SoundFieldsSchema.extend({ file: z.string().min(1).optional() });
export type SoundInput = z.infer<typeof SoundInputSchema>;

// Un sound tel que les pages le voient. `version` change à chaque écriture : l'adresse de son fichier change avec elle.
// `rewardTitles` : les titres des rewards qui le désignent. `clipCount` : combien de clips confirmés ont un de ses rires, `null`
// quand le dossier des clips est illisible (le nombre n'est alors pas inventé).
export const SoundSummarySchema = SoundFieldsSchema.extend({
  id: z.string().min(1),
  version: z.string().min(1),
  rewardTitles: z.array(z.string()),
  clipCount: z.number().int().min(0).nullable(),
});
export type SoundSummary = z.infer<typeof SoundSummarySchema>;

export const SoundListSchema = z.object({ sounds: z.array(SoundSummarySchema) });

// Ce que le serveur envoie à la page /sounds : un sound à jouer (le `playId` revient dans sa réponse), ou l'ordre de se taire.
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

// La réponse de la page /sounds quand un sound a fini (`ended`) ou n'a pas pu jouer (`failed`, avec la raison).
export const SoundOutcomeSchema = z.object({
  playId: z.string().min(1),
  outcome: z.enum(["ended", "failed"]),
  reason: z.string().max(200).optional(),
});
export type SoundOutcome = z.infer<typeof SoundOutcomeSchema>;

// Un refus d'un sound : l'élément fautif (vide pour une panne) et ce qui est attendu.
export type SoundIssue = { path: string; message: string };
