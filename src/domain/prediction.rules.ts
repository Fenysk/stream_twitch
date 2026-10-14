// Une issue d'une prédiction terminée : son identifiant, son titre, et combien de viewers l'ont choisie.
export type PredictionOutcome = { id: string; title: string; users: number };

// Les perdants d'une prédiction résolue : tous ceux qui ont choisi une autre issue que la gagnante, et le titre de l'issue
// perdante la plus suivie (la première à égalité). Personne n'a perdu : pas d'issue citée. `null` : l'issue gagnante n'est pas
// parmi les issues, le résultat est illisible.
export function toPredictionLosers(
  outcomes: readonly PredictionOutcome[],
  winningId: string,
): { losers: number; outcome: string | null } | null {
  if (!outcomes.some(({ id }) => id === winningId)) return null;
  const losing = outcomes.filter(({ id }) => id !== winningId);
  const losers = losing.reduce((sum, { users }) => sum + users, 0);
  const top = losing.reduce<PredictionOutcome | null>(
    (best, outcome) => (best === null || outcome.users > best.users ? outcome : best),
    null,
  );
  return { losers, outcome: losers > 0 && top ? top.title : null };
}
