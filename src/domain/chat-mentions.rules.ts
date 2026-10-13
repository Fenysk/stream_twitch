import { type InsultList, toInsultMatch } from "./chat-insults.rules";

// Un nickname cité (« @Benitoad »), avec la ponctuation qui lui est collée (« @Benitoad, », « @Benitoad! »).
const MENTION = /^@([\p{L}\p{N}_]{1,25})(?![\p{L}\p{N}_])(.*)$/su;

type Mention = { name: string; rest: string };

const toMention = (word: string): Mention | null => {
  const [, name, rest] = MENTION.exec(word) ?? [];
  return name === undefined ? null : { name, rest: rest ?? "" };
};

// `insult` : l'entrée de la liste qui a fait retirer une mention, pour dire pourquoi un message se retrouve vide.
export type SpokenMentions = { text: string; insult: string | null };

// Les mentions du texte, comme le renard les dit : sans arobase, avec une virgule derrière celles qui ouvrent le message
// (« @Benitoad t'as vu ? » devient « Benitoad, t'as vu ? »). Un nickname que la liste d'insultes refuse est retiré du texte.
// Le texte arrive aux blancs réduits (toTextWithoutEmotes) ; seules les mentions sont changées.
export function toSpokenMentions(text: string, insults: InsultList): SpokenMentions {
  const parts = text
    .split(/\s+/u)
    .filter((word) => word !== "")
    .map((word) => {
      const mention = toMention(word);
      return { word, mention, insult: mention ? toInsultMatch(mention.name, insults) : null };
    });
  const kept = parts.filter(({ insult }) => insult === null);
  const firstWord = kept.findIndex(({ mention }) => mention === null);
  const openingCount = firstWord < 0 ? kept.length : firstWord;
  const spoken = kept.map(({ word, mention }, index) => {
    if (!mention) return word;
    const isOpening = index < openingCount && index < kept.length - 1;
    return isOpening && mention.rest === "" ? `${mention.name},` : `${mention.name}${mention.rest}`;
  });
  return { text: spoken.join(" "), insult: parts.find(({ insult }) => insult !== null)?.insult ?? null };
}
