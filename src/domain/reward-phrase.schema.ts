import { z } from "zod";

// Les phrases de Jean-Renard pour une récompense, avec le dernier titre que Twitch lui a donné : de quoi la reconnaître si elle
// disparaît de la chaîne.
export const RewardPhrasesRecordSchema = z.object({
  title: z.string(),
  phrases: z.array(z.string().min(1)).min(1),
});
export type RewardPhrasesRecord = z.infer<typeof RewardPhrasesRecordSchema>;

// data/reward-phrases.json : les phrases de chaque récompense, par id de récompense. Une récompense sans phrases n'y est pas.
export const RewardPhrasesFileSchema = z.record(z.string().min(1), RewardPhrasesRecordSchema);
export type RewardPhrasesFile = z.infer<typeof RewardPhrasesFileSchema>;

// Ce que l'interface envoie : toute la liste de la récompense, vide pour lui retirer ses phrases. Le serveur répond de même, avec
// les phrases gardées.
export const RewardPhrasesInputSchema = z.object({
  phrases: z.array(z.string("chaque phrase doit être un texte"), "les phrases doivent être une liste"),
});
export type RewardPhrasesInput = z.infer<typeof RewardPhrasesInputSchema>;

// Une récompense telle que l'onglet la montre. `isMissing` : Twitch ne la connaît plus. `isReserved` : son titre est celui d'une
// récompense du renard (clash, wake), dont les phrases se règlent dans l'onglet Renard.
export const RewardPhrasesEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  isMissing: z.boolean(),
  isReserved: z.boolean(),
  phrases: z.array(z.string()),
});
export type RewardPhrasesEntry = z.infer<typeof RewardPhrasesEntrySchema>;

export const RewardPhrasesListSchema = z.object({ rewards: z.array(RewardPhrasesEntrySchema) });
