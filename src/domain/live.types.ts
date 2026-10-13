import type { RawMessage } from "./chat.types";

// Ce qui arrive dans le live et que le renard remercie. Les subs, les subs offerts et les cheers viennent du tchat (IRC),
// les follows d'EventSub. Un sub offert à plusieurs en même temps est UN évènement (`mystery-gift`), pas un par destinataire.
export type LiveEvent =
  | { kind: "follow"; user: string }
  // Un sub ou un resub, avec le message qui l'accompagne s'il y en a un.
  | { kind: "sub"; user: string; message: RawMessage | null }
  | { kind: "gift"; user: string; recipient: string }
  | { kind: "mystery-gift"; user: string; count: number }
  // Des bits, avec le message qui les accompagne s'il en reste un (les cheermotes ne comptent pas).
  | { kind: "cheer"; user: string; bits: number; message: RawMessage | null };
