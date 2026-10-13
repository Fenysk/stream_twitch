export type SpamKind = "drawing" | "letters" | "repetition" | "capitals";

// Les blocs Unicode des dessins en caractères : traits de cadre, blocs pleins, formes, braille.
const GLYPH = /[─-▟■-◿⠀-⣿]/gu;
const MIN_GLYPHS = 4;
const SAME_CHARACTER = /(.)\1{5,}/su;
const MIN_REPEATS = 4;
const MIN_REPEATED_SHARE = 0.5;
const MIN_LETTERS_FOR_CAPITALS = 10;
const MIN_CAPITALS_SHARE = 0.7;
const MIN_CHARACTERS_FOR_DRAWING = 8;
const MIN_SYMBOLS_SHARE = 0.5;

const toWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word !== "");

const isRepetition = (text: string): boolean => {
  const words = toWords(text);
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  return most >= MIN_REPEATS && most / words.length >= MIN_REPEATED_SHARE;
};

const isCapitals = (text: string, capitalsMaxLength: number): boolean => {
  if (Array.from(text).length <= capitalsMaxLength) return false;
  const letters = Array.from(text).filter((character) => /\p{L}/u.test(character));
  const capitals = letters.filter((letter) => letter !== letter.toLowerCase());
  return letters.length >= MIN_LETTERS_FOR_CAPITALS && capitals.length / letters.length >= MIN_CAPITALS_SHARE;
};

const isDrawing = (text: string): boolean => {
  const characters = Array.from(text).filter((character) => !/\s/u.test(character));
  const symbols = characters.filter((character) => !/[\p{L}\p{N}]/u.test(character));
  return (
    characters.length >= MIN_CHARACTERS_FOR_DRAWING && symbols.length / characters.length >= MIN_SYMBOLS_SHARE
  );
};

// Un message qui répète, crie ou dessine au lieu de dire quelque chose : le renard ne le lit pas. Les seuils sont ceux du
// brainstorm du 06/10 ; le journal du serveur dit lequel a joué, de quoi les régler. Un message de `capitalsMaxLength`
// caractères ou moins passe la règle des majuscules (« GG », « JEANRENARD ») ; les autres règles jouent toujours.
export function toSpamKind(text: string, capitalsMaxLength: number): SpamKind | null {
  if ((text.match(GLYPH) ?? []).length >= MIN_GLYPHS) return "drawing";
  if (SAME_CHARACTER.test(text)) return "letters";
  if (isRepetition(text)) return "repetition";
  if (isCapitals(text, capitalsMaxLength)) return "capitals";
  return isDrawing(text) ? "drawing" : null;
}
