import type { ChatLook, ChatMessage } from "./chat.schema";

// Une rangée de la colonne : un message montré, ou qui vient de partir et finit son fondu (`leftAt`, l'instant de son départ).
export type ChatRow = { message: ChatMessage; leftAt: number | null };

// Quand le message cesse d'être montré, ou `null` s'il reste (durée 0).
const toExpiry = (message: ChatMessage, look: ChatLook): number | null =>
  look.duration === 0 ? null : message.receivedAt + look.duration * 1000;

const isExpired = (message: ChatMessage, look: ChatLook, now: number): boolean => {
  const expiry = toExpiry(message, look);
  return expiry !== null && now >= expiry;
};

// Les messages à montrer à cet instant : ni masqués (sauf réglage), ni périmés, et au plus `maxMessages`, les plus récents.
export const toShownMessages = (messages: ChatMessage[], look: ChatLook, now: number): ChatMessage[] =>
  messages
    .filter((candidate) => (look.shouldShowHidden || !candidate.isHidden) && !isExpired(candidate, look, now))
    .slice(-look.maxMessages);

// Les rangées après un changement : celles des messages montrés, et à leur place celles des messages qui partent,
// gardées le temps de leur fondu. Un message qui revient redevient une rangée normale.
export const toNextRows = (rows: ChatRow[], shown: ChatMessage[], now: number): ChatRow[] => {
  const shownIds = new Set(shown.map((candidate) => candidate.id));
  const staying: ChatRow[] = shown.map((message) => ({ message, leftAt: null }));
  const leaving: ChatRow[] = rows
    .filter((row) => !shownIds.has(row.message.id))
    .map((row) => ({ message: row.message, leftAt: row.leftAt ?? now }));
  return [...staying, ...leaving].sort(
    (first, second) => first.message.receivedAt - second.message.receivedAt,
  );
};

// Les rangées dont le fondu n'est pas fini : les autres sortent de la colonne.
export const toKeptRows = (rows: ChatRow[], now: number, fadeMs: number): ChatRow[] =>
  rows.filter((row) => row.leftAt === null || now - row.leftAt < fadeMs);

// Le prochain instant où la colonne doit changer sans qu'un message arrive : la fin d'un message, ou la fin d'un fondu.
export const toNextWake = (rows: ChatRow[], look: ChatLook, fadeMs: number): number | null => {
  const wakes = rows
    .map((row) => (row.leftAt === null ? toExpiry(row.message, look) : row.leftAt + fadeMs))
    .filter((wake): wake is number => wake !== null);
  return wakes.length === 0 ? null : Math.min(...wakes);
};
