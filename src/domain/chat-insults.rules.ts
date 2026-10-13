export type InsultList = {
  // Les mots entiers (« =con ») : la forme normalisée, et l'entrée telle qu'elle est écrite dans la liste.
  words: ReadonlyMap<string, string>;
  // Les entrées cherchées partout dans le message, espaces et signes retirés.
  parts: readonly { key: string; entry: string }[];
};

// Chiffres et signes mis à la place des lettres.
const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "@": "a",
  $: "s",
};

// Une entrée cherchée partout doit être assez longue pour ne pas se trouver dans un mot ordinaire.
const MIN_PART_LENGTH = 5;

// Trois lettres identiques ou plus comptent pour deux : « connnnard » devient « connard ». Une lettre doublée dans la
// liste (« nigger », « conne ») ne se confond pas avec la même lettre seule (« Niger », « cône »).
const reduce = (text: string): string => text.replace(/(.)\1{2,}/gsu, "$1$1");
const collapse = (text: string): string => text.replace(/(.)\1+/gsu, "$1");

// Minuscules, sans accents, les chiffres et signes remis en lettres : « C0NN4RD » devient « connard ».
const fold = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[01345@$]/g, (character) => LEET[character] ?? character);

const toForms = (text: string): { words: string[]; squashed: string } => {
  const folded = fold(text);
  return {
    // Un trait d'union lie les mots (« pique-nique » est un mot, pas « nique »).
    words: folded
      .split(/[^a-z-]+/)
      .map((word) => word.replace(/^-+|-+$/g, ""))
      .filter((word) => word !== ""),
    squashed: folded.replace(/[^a-z]+/g, ""),
  };
};

const toEntry = (line: string): { entry: string; isWord: boolean } => {
  const isWord = line.startsWith("=");
  return { entry: isWord ? line.slice(1).trim() : line, isWord };
};

// Une entrée par ligne ; `#` ouvre un commentaire ; `=mot` ne se trouve que comme mot entier (« con », « pd »), sans « = »
// l'entrée se cherche partout dans le message. Une entrée sans lettre, ou trop courte pour être cherchée partout, est ignorée.
export function toInsultList(fileText: string): InsultList {
  const words = new Map<string, string>();
  const parts: { key: string; entry: string }[] = [];
  for (const raw of fileText.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const { entry, isWord } = toEntry(line);
    const squashed = toForms(entry).squashed;
    if (squashed === "") continue;
    const key = reduce(squashed);
    if (isWord && !/\s/u.test(entry)) words.set(key, entry);
    else if (collapse(key).length >= MIN_PART_LENGTH) parts.push({ key, entry });
  }
  return { words, parts };
}

// Les lettres de l'entrée par blocs : « connard » donne c, o, nn, a, r, d. Une lettre seule accepte d'être répétée à volonté
// dans le message (« connnard »), mais une lettre doublée en veut au moins deux : « conne » n'est pas « cone ».
const toPattern = (key: string): string =>
  [...key.matchAll(/(.)\1?/gsu)]
    .map(([block, letter]) => `${letter}${block.length === 2 ? "{2,}" : "+"}`)
    .join("");

const patterns = new Map<string, RegExp>();
const toRegExp = (source: string): RegExp => {
  const known = patterns.get(source);
  if (known) return known;
  const created = new RegExp(source);
  patterns.set(source, created);
  return created;
};

// L'entrée de la liste que le message contient, ou `null`. Un mot entier s'accorde aussi au pluriel (« cons »).
export function toInsultMatch(text: string, list: InsultList): string | null {
  const { words, squashed } = toForms(text);
  const part = list.parts.find(({ key }) => toRegExp(toPattern(key)).test(squashed));
  if (part) return part.entry;
  for (const word of words) {
    for (const [key, entry] of list.words) {
      if (toRegExp(`^${toPattern(key)}[sx]*$`).test(word)) return entry;
    }
  }
  return null;
}
