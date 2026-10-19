import type { ChatViewer } from "./chat-viewers.schema";

// La liste par pseudo, sans tenir compte de la casse ni des accents (« élise » avant « Zoé »), `id` départageant deux pseudos pareils ; la
// liste d'origine n'est pas touchée.
export const toSortedChatViewers = (chatViewers: readonly ChatViewer[]): ChatViewer[] =>
  [...chatViewers].sort(
    (first, second) =>
      first.nickname.localeCompare(second.nickname, "fr", { sensitivity: "base" }) ||
      first.id.localeCompare(second.id),
  );
