import type { ReactionImage } from "./fox.schema";

// « gg » est un mot entier : « eggs » et « ggwp » ne comptent pas.
const GG = /(?<![\p{L}\p{N}])gg(?![\p{L}\p{N}])/iu;

// Sans accents, sans majuscules, sans espaces ni tiret : « Jean-Renard », « jean renard » et « JEANRENARD » sont le même nom.
const toLetters = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]+/g, "");

const isSmile = (text: string): boolean =>
  GG.test(text) || text.includes("<3") || toLetters(text).includes("jeanrenard");

// L'image que le renard montre 1 s avant de lire le message, ou `null` : il le lit tout de suite. Les mots-clés se cherchent
// dans le message tel qu'il est écrit (« <3 » et « ;) » sont aussi des emotes de Twitch). Plusieurs mots-clés : le premier de
// l'ordre du CDC gagne, sourire (gg, <3, Jean-Renard), puis choc (?!), puis clin d'œil (;) et 😉).
export function toReaction(text: string): ReactionImage | null {
  if (isSmile(text)) return "front-smile-rest";
  if (text.includes("?!")) return "left-large-rest";
  if (text.includes(";)") || text.includes("😉")) return "wink-tongue-rest";
  return null;
}
