import type { RewardSummary } from "../../domain/reward.schema";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";

// Une ligne de l'onglet : une récompense et ses phrases de Jean-Renard (`null` : la liste des phrases n'est pas lue, ou la
// récompense n'en a pas d'entrée).
export type RewardRowContent = { reward: RewardSummary; phrases: RewardPhrasesEntry | null };

// Les lignes de l'onglet : chaque récompense avec ses phrases (jointes par id), puis les récompenses disparues de Twitch qui gardent
// des phrases sans avoir de sound ni d'enregistrement : elles se montrent encore, de quoi retirer leurs phrases.
export function toRewardRows(
  rewards: readonly RewardSummary[],
  phrases: readonly RewardPhrasesEntry[] | null,
): RewardRowContent[] {
  const entries = phrases ?? [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const known = new Set(rewards.map(({ id }) => id));
  const rows = rewards.map((reward) => ({ reward, phrases: byId.get(reward.id) ?? null }));
  const orphans = entries
    .filter(({ id, isMissing }) => isMissing && !known.has(id))
    .map((entry) => ({
      reward: {
        id: entry.id,
        title: entry.title,
        cost: 0,
        pace: 0,
        isManaged: false,
        isMissing: true,
        sound: null,
      },
      phrases: entry,
    }));
  return [...rows, ...orphans];
}
