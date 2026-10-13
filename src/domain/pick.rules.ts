// Tirer une phrase au hasard dans une liste, sans répéter avant d'avoir tout dit. `said` : les phrases déjà dites depuis le
// dernier tour de la liste ; l'appelant le garde d'un tirage à l'autre. Une phrase retirée de la liste entre deux tirages est
// simplement ignorée.
export type PhrasePick = { phrase: string; said: string[] };

const pickOne = (phrases: readonly string[], random: () => number): string =>
  phrases[Math.min(phrases.length - 1, Math.floor(random() * phrases.length))] ?? "";

export function toNextPick(
  phrases: readonly string[],
  said: readonly string[],
  random: () => number,
): PhrasePick | null {
  if (phrases.length === 0) return null;
  const unsaid = phrases.filter((phrase) => !said.includes(phrase));
  if (unsaid.length > 0) {
    const phrase = pickOne(unsaid, random);
    return { phrase, said: [...said, phrase] };
  }
  // Tout est dit : un nouveau tour, qui ne recommence pas par la dernière phrase dite.
  const last = said.at(-1);
  const others = phrases.filter((phrase) => phrase !== last);
  const phrase = pickOne(others.length > 0 ? others : phrases, random);
  return { phrase, said: [phrase] };
}
