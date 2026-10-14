import type { RawMessage } from "../domain/chat.types";

// Un viewer et le nombre de ses messages acceptés depuis le démarrage du serveur.
export type Counted = { viewerId: string; nickname: string; messages: number };

export type FoxTally = {
  // Un message accepté d'un viewer (pas du compte de la chaîne) : son compte monte d'un, et les abonnés le reçoivent.
  noteMessage(raw: RawMessage): void;
  // `listener` reçoit le compte du viewer après chacun de ses messages. Rend de quoi se désabonner.
  subscribe(listener: (counted: Counted) => void): () => void;
  // Les viewers qui ont écrit, dans l'ordre de leur premier message accepté.
  list(): readonly Counted[];
};

// Le compte des messages acceptés de chaque viewer depuis le démarrage du serveur, gardé en mémoire : un redémarrage vaut un
// nouveau live. Jamais le contenu d'un message.
export function createFoxTally(): FoxTally {
  const counts = new Map<string, Counted>();
  const listeners = new Set<(counted: Counted) => void>();

  return {
    noteMessage({ viewerId, nickname }) {
      const counted = { viewerId, nickname, messages: (counts.get(viewerId)?.messages ?? 0) + 1 };
      counts.set(viewerId, counted);
      for (const listener of listeners) listener(counted);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    list: () => [...counts.values()],
  };
}
