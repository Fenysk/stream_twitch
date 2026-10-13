// La prononciation : avant la synthèse, et pour tout ce que le renard dit, une abréviation (ou un nom) est remplacée par sa
// forme parlée. Chaque ligne du réglage `foxPronunciations` s'écrit « abréviation = forme dite » ; le mot est entier, sans
// tenir compte des majuscules.
export type Pronunciation = { written: string; spoken: string };

// Une ligne « wtf = what the fuck ». Le premier « = » sépare ; une ligne sans « = », ou dont un côté est vide, n'est pas une
// prononciation.
export function toPronunciation(line: string): Pronunciation | null {
  const separator = line.indexOf("=");
  if (separator < 0) return null;
  const written = line.slice(0, separator).trim();
  const spoken = line.slice(separator + 1).trim();
  return written === "" || spoken === "" ? null : { written, spoken };
}

// Les prononciations des lignes, dans l'ordre ; si une abréviation revient (sans tenir compte des majuscules), la dernière gagne.
export function toPronunciations(lines: readonly string[]): Pronunciation[] {
  const byWritten = new Map<string, Pronunciation>();
  for (const line of lines) {
    const pronunciation = toPronunciation(line);
    if (pronunciation) byWritten.set(pronunciation.written.toLowerCase(), pronunciation);
  }
  return [...byWritten.values()];
}

// Les caractères qui font un mot : un « mot entier » n'est pas collé à l'un d'eux (« xd » n'est pas dans « xdr », « <3 » est
// seul entre deux espaces).
const WORD_EDGE = "[\\p{L}\\p{N}]";

const toLiteral = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Le texte une fois les abréviations remplacées par leur forme parlée, en un seul passage : une forme parlée n'est jamais
// remplacée à son tour.
export function toSpokenText(text: string, pronunciations: readonly Pronunciation[]): string {
  if (pronunciations.length === 0) return text;
  const spokenOf = new Map(pronunciations.map(({ written, spoken }) => [written.toLowerCase(), spoken]));
  const alternatives = [...spokenOf.keys()]
    .sort((first, second) => second.length - first.length)
    .map(toLiteral)
    .join("|");
  const whole = new RegExp(`(?<!${WORD_EDGE})(?:${alternatives})(?!${WORD_EDGE})`, "giu");
  return text.replace(whole, (match) => spokenOf.get(match.toLowerCase()) ?? match);
}
