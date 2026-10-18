import { z } from "zod";

// Les bornes d'un reward : le titre est celui de Twitch (45 caractères, unique sur la chaîne) ; la pace va de 0 (aucune) à 7 jours,
// le plus long cooldown que Twitch accepte.
export const REWARD_LIMITS = { titleMax: 45, paceMax: 604_800 } as const;

// Ce que le formulaire propose au départ : 100 points, une pace de 30 s.
export const REWARD_DEFAULTS = { cost: 100, pace: 30 } as const;

// Ce que l'app écrit sur Twitch pour un reward qu'elle gère. `pace` : des secondes (0 = aucune).
export const RewardFieldsSchema = z.object({
  title: z
    .string("le titre doit être un texte")
    .trim()
    .min(1, "le titre ne peut pas être vide")
    .max(REWARD_LIMITS.titleMax, `le titre fait ${REWARD_LIMITS.titleMax} caractères au plus`),
  cost: z
    .number("le coût doit être un nombre")
    .int("le coût est un nombre entier")
    .min(1, "le coût vaut 1 point au moins"),
  pace: z
    .number("la pace doit être un nombre")
    .int("la pace est un nombre entier de secondes")
    .min(0, "la pace ne peut pas être négative")
    .max(REWARD_LIMITS.paceMax, `la pace fait ${REWARD_LIMITS.paceMax} secondes au plus (7 jours)`),
});

// Un identifiant de sound, ou `null` : le reward n'a pas de sound.
const SoundChoiceSchema = z.string().min(1).nullable();

// Ce que l'interface envoie pour créer un reward : ses champs et son sound (absent : aucun).
export const RewardCreationSchema = RewardFieldsSchema.extend({ sound: SoundChoiceSchema.default(null) });
export type RewardCreation = z.infer<typeof RewardCreationSchema>;

// Ce que l'interface envoie pour choisir le sound d'un reward : son identifiant, ou `null` pour lui retirer son sound.
export const RewardSoundInputSchema = z.object({ sound: SoundChoiceSchema });

// Un enregistrement de data/rewards.json : le dernier titre lu sur Twitch (de quoi montrer un reward disparu), le sound du reward
// et `isManaged` : l'app a créé ce reward (elle le modifie, le supprime, le met en pause, marque ses rachats).
export const RewardRecordSchema = z.object({
  title: z.string(),
  sound: SoundChoiceSchema,
  isManaged: z.boolean(),
});
export type RewardRecord = z.infer<typeof RewardRecordSchema>;

// data/rewards.json : les enregistrements par id de reward. Un reward y est s'il a un sound, ou si l'app l'a créé.
export const RewardRecordsFileSchema = z.record(z.string().min(1), RewardRecordSchema);
export type RewardRecordsFile = z.infer<typeof RewardRecordsFileSchema>;

// Un reward tel que l'onglet le montre. `isMissing` : Twitch ne le connaît plus (son coût et sa pace valent alors 0, sans sens).
// `sound` : l'identifiant de son sound, ou `null`.
export const RewardSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  cost: z.number().int().min(0),
  pace: z.number().int().min(0),
  isManaged: z.boolean(),
  isMissing: z.boolean(),
  sound: SoundChoiceSchema,
});
export type RewardSummary = z.infer<typeof RewardSummarySchema>;

export const RewardListSchema = z.object({ rewards: z.array(RewardSummarySchema) });
