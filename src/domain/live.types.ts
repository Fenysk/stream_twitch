import type { RawMessage } from "./chat.types";

// Ce qui arrive dans le live et que le renard remercie. Les subs, les subs offerts, les cheers et les raids viennent du tchat
// (IRC), les follows, les récompenses et les prédictions d'EventSub. Un sub offert à plusieurs en même temps est UN évènement (`mystery-gift`), pas un par destinataire.
export type LiveEvent =
  | { kind: "follow"; user: string }
  // Un sub ou un resub, avec le message qui l'accompagne s'il y en a un.
  | { kind: "sub"; user: string; message: RawMessage | null }
  | { kind: "gift"; user: string; recipient: string }
  | { kind: "mystery-gift"; user: string; count: number }
  // Des bits, avec le message qui les accompagne s'il en reste un (les cheermotes ne comptent pas).
  | { kind: "cheer"; user: string; bits: number; message: RawMessage | null }
  // Un raid entrant : le streamer qui arrive, et combien de viewers il amène (au moins 1).
  | { kind: "raid"; user: string; viewers: number }
  // Une récompense de points de chaîne dépensée (EventSub) : son titre seulement, jamais le texte que le viewer y joint.
  | { kind: "reward"; user: string; title: string }
  // Une prédiction résolue (EventSub) : combien de viewers ont perdu, et le titre de l'issue perdante la plus suivie (`null` quand
  // personne n'a perdu).
  | { kind: "prediction"; losers: number; outcome: string | null };
