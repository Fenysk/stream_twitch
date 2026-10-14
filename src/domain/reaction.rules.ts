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

// Une emote qui change sa tête : son nom exact (majuscules comprises) et la réaction qu'elle donne.
export type EmoteReaction = { name: string; image: ReactionImage };

// Au plus une réaction d'une emote seule (un message sans rien à lire) dans ce délai (ms).
export const EMOTE_REACTION_GAP_MS = 5000;

const REACTION_WORDS: Readonly<Record<string, ReactionImage>> = {
  sourire: "front-smile-rest",
  choc: "left-large-rest",
  clin: "wink-tongue-rest",
  "clin d'oeil": "wink-tongue-rest",
  "clin d'œil": "wink-tongue-rest",
};

// « LUL = sourire » : le nom de l'emote, un signe égal, puis sourire, choc ou clin. Le nom n'a pas d'espace (le tchat se coupe
// aux espaces) ; il se lit jusqu'au dernier signe égal, parce qu'une emote peut en contenir un. Toute autre ligne : `null`.
export function toEmoteReaction(line: string): EmoteReaction | null {
  const separator = line.lastIndexOf("=");
  if (separator < 0) return null;
  const name = line.slice(0, separator).trim();
  const word = line
    .slice(separator + 1)
    .trim()
    .toLowerCase();
  const image = Object.hasOwn(REACTION_WORDS, word) ? REACTION_WORDS[word] : undefined;
  return name === "" || /\s/u.test(name) || image === undefined ? null : { name, image };
}

// Les lignes du réglage en emotes ; une ligne illisible est ignorée, et la première ligne d'une emote gagne.
export function toEmoteReactions(lines: readonly string[] = []): EmoteReaction[] {
  const reactions = new Map<string, EmoteReaction>();
  for (const line of lines) {
    const reaction = toEmoteReaction(line);
    if (reaction && !reactions.has(reaction.name)) reactions.set(reaction.name, reaction);
  }
  return [...reactions.values()];
}

// L'image que le renard montre 1 s avant de lire le message, ou `null` : il le lit tout de suite. Les mots-clés se cherchent
// dans le message tel qu'il est écrit (« <3 » et « ;) » sont aussi des emotes de Twitch), et les emotes de la liste par leur nom
// exact, mot entier. Plusieurs mots-clés : le premier de l'ordre du CDC gagne, sourire (gg, <3, Jean-Renard), puis choc (?!),
// puis clin d'œil (;) et 😉) ; une emote de la liste vaut un mot-clé de sa réaction.
export function toReaction(text: string, emotes: readonly EmoteReaction[] = []): ReactionImage | null {
  const words = new Set(text.split(/\s+/u));
  const isEmote = (image: ReactionImage): boolean =>
    emotes.some((emote) => emote.image === image && words.has(emote.name));
  if (isSmile(text) || isEmote("front-smile-rest")) return "front-smile-rest";
  if (text.includes("?!") || isEmote("left-large-rest")) return "left-large-rest";
  if (text.includes(";)") || text.includes("😉") || isEmote("wink-tongue-rest")) return "wink-tongue-rest";
  return null;
}
