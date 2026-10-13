import type { EmoteRange } from "./chat.types";
import { toFragments } from "./chat-fragments.rules";

const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// Le texte que le renard dit : sans les emotes de Twitch (repérées par leurs positions, comme l'affichage les découpe), et
// sans les mots de la liste (7TV, BTTV et FFZ ne sont pas dans les positions de Twitch ; leurs noms s'écrivent avec leurs
// majuscules). Vide quand il ne restait que des emotes.
export function toTextWithoutEmotes(
  text: string,
  ranges: readonly EmoteRange[],
  names: readonly string[],
): string {
  const known = new Set(names);
  const withoutTwitchEmotes = toFragments(text, ranges)
    .flatMap((fragment) => (fragment.kind === "text" ? [fragment.text] : []))
    .join(" ");
  return withoutTwitchEmotes
    .split(/\s+/u)
    .filter((word) => word !== "" && !known.has(word.replace(EDGES, "")))
    .join(" ");
}
