import type { ChatFragment } from "./chat.schema";
import type { EmoteRange } from "./chat.types";

const isUsable = ({ start, end }: EmoteRange, cursor: number, length: number): boolean =>
  Number.isInteger(start) && Number.isInteger(end) && start >= cursor && end >= start && end < length;

// Twitch compte les positions en points de code ; un index de chaîne JavaScript compte des unités UTF-16 (un emoji en
// vaut 2) et décalerait les emotes qui suivent. `Array.from` découpe par points de code.
// Une emote hors du texte, à l'envers ou qui chevauche la précédente est ignorée : son texte reste.
export const toFragments = (text: string, emotes: readonly EmoteRange[]): ChatFragment[] => {
  const points = Array.from(text);
  const fragments: ChatFragment[] = [];
  let cursor = 0;
  const pushText = (end: number) => {
    if (end > cursor) fragments.push({ kind: "text", text: points.slice(cursor, end).join("") });
  };
  for (const emote of [...emotes].sort((first, second) => first.start - second.start)) {
    if (!isUsable(emote, cursor, points.length)) continue;
    pushText(emote.start);
    fragments.push({ kind: "emote", id: emote.id, name: points.slice(emote.start, emote.end + 1).join("") });
    cursor = emote.end + 1;
  }
  pushText(points.length);
  return fragments;
};
