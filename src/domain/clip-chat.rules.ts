import type { ChatMessage } from "./chat.schema";
import type { ClipChat } from "./clip.schema";

// Le serveur garde en mémoire le tchat des 3 dernières minutes : le tampon de relecture d'OBS en couvre 2 (un clip d'~118 s).
export const CHAT_KEPT_MS = 3 * 60_000;

// Après la sauvegarde, le serveur attend encore 10 s : les réactions arrivent après le clic.
export const CHAT_AFTER_MS = 10_000;

// Les messages des 3 dernières minutes (ceux qui ont l'heure de réception `receivedAt`, comme la page du tchat les reçoit).
export const toKeptMessages = (messages: readonly ChatMessage[], now: number): ChatMessage[] =>
  messages.filter(({ receivedAt }) => receivedAt >= now - CHAT_KEPT_MS);

// Le tchat d'un clip : les messages reçus de [sauvegarde − durée du clip, sauvegarde + 10 s], tels que la page du tchat les reçoit
// (pour les réafficher avec le même rendu). Sans durée de clip, tout ce que le serveur garde avant la sauvegarde.
export const toClipChat = (
  messages: readonly ChatMessage[],
  savedAt: number,
  clipDurationMs: number | undefined,
): ClipChat => {
  const from = savedAt - (clipDurationMs ?? CHAT_KEPT_MS);
  const to = savedAt + CHAT_AFTER_MS;
  return { savedAt, messages: messages.filter(({ receivedAt }) => receivedAt >= from && receivedAt <= to) };
};
