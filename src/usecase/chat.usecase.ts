import type { ChatEvent, ChatMessage } from "../domain/chat.schema";
import type { RawMessage } from "../domain/chat.types";
import { toChatMessage } from "../domain/chat-message.rules";
import { type ChatSettings, isSameChatLook, toChatBots, toChatLook } from "../domain/chat-settings.rules";
import type { LiveEvent } from "../domain/live.types";

// De quoi remplir une page qui se connecte (ou se rafraîchit) : les derniers messages, pas tout le tchat. Le tchat du téléphone les garde
// tous (sans limite) ; les pages d'OBS n'en gardent que 100 (CHAT_STATE_SIZE).
export const CHAT_HISTORY_SIZE = 200;

// Ce que la source du tchat dit au usecase. Un ban et un timeout sont le même évènement : les messages du viewer sortent.
export type ChatSourceEvent =
  | { kind: "message"; message: RawMessage }
  | { kind: "message-deleted"; messageId: string }
  | { kind: "viewer-messages-deleted"; viewerId: string }
  // Un sub, un resub, un sub offert ou des bits : le renard les remercie.
  | { kind: "live"; event: LiveEvent };

// Le tchat vu du usecase : infra l'implémente (ComfyJS), app le câble.
export type ChatSource = {
  start(listener: (event: ChatSourceEvent) => void): void;
  stop(): void;
};

// L'état du tchat à la connexion, puis chaque changement : les pages ouvertes (OBS, aperçu des réglages) s'y abonnent.
export type ChatFeed = {
  getSnapshot(): ChatEvent;
  subscribe(listener: (event: ChatEvent) => void): () => void;
};

export type Chat = {
  feed: ChatFeed;
  start(): void;
  stop(): void;
  // De nouveaux réglages, appliqués aussitôt : l'allure part vers les pages, les bots valent pour les messages suivants.
  update(settings: ChatSettings): void;
  // Les évènements de la source tels quels (le message brut, avec son viewer et ses emotes, et les suppressions de la
  // modération) : le renard y lit les messages. Ils arrivent après la publication aux pages.
  subscribeSource(listener: (event: ChatSourceEvent) => void): () => void;
};

export type ChatDeps = { source: ChatSource; settings: ChatSettings; clock: () => number };

type Entry = { viewerId: string; message: ChatMessage };

export function createChat({ source, settings, clock }: ChatDeps): Chat {
  let look = toChatLook(settings);
  let bots = toChatBots(settings);
  let history: Entry[] = [];
  const listeners = new Set<(event: ChatEvent) => void>();
  const sourceListeners = new Set<(event: ChatSourceEvent) => void>();

  const publish = (event: ChatEvent) => {
    for (const listener of listeners) listener(event);
  };

  const receiveMessage = (raw: RawMessage) => {
    const message = toChatMessage(raw, bots, clock());
    history = [...history, { viewerId: raw.viewerId, message }].slice(-CHAT_HISTORY_SIZE);
    publish({ kind: "message", message });
  };

  const deleteWhere = (isDeleted: (entry: Entry) => boolean) => {
    const messageIds = history.filter(isDeleted).map((entry) => entry.message.id);
    if (messageIds.length === 0) return;
    history = history.filter((entry) => !isDeleted(entry));
    publish({ kind: "delete", messageIds });
  };

  const receive = (event: ChatSourceEvent) => {
    switch (event.kind) {
      case "message":
        receiveMessage(event.message);
        break;
      case "message-deleted":
        deleteWhere((entry) => entry.message.id === event.messageId);
        break;
      case "viewer-messages-deleted":
        deleteWhere((entry) => entry.viewerId === event.viewerId);
        break;
    }
    for (const listener of sourceListeners) listener(event);
  };

  return {
    feed: {
      getSnapshot: () => ({ kind: "snapshot", messages: history.map((entry) => entry.message), look }),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    subscribeSource(listener) {
      sourceListeners.add(listener);
      return () => {
        sourceListeners.delete(listener);
      };
    },
    start: () => source.start(receive),
    stop: () => source.stop(),
    update(next) {
      bots = toChatBots(next);
      const nextLook = toChatLook(next);
      if (isSameChatLook(look, nextLook)) return;
      look = nextLook;
      publish({ kind: "look", look });
    },
  };
}
