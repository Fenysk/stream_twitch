import type { ChatEvent, ChatLook, ChatMessage } from "./chat.schema";

// Un message vu du téléphone, qui montre le tchat du streamer et non celui d'OBS : tout ce que le serveur envoie, rien n'est retiré.
// `isDeleted` : un modo, un ban ou un timeout l'a supprimé depuis ; il reste, barré.
export type PhoneChatMessage = { message: ChatMessage; isDeleted: boolean };

// Ce que le téléphone sait du tchat : tout ce qu'il a reçu depuis son ouverture, du plus ancien au plus récent (sans limite, sans durée
// de vie), et l'allure d'OBS une fois que le serveur l'a donnée.
export type PhoneChatState = { messages: PhoneChatMessage[]; look: ChatLook | null };

export const EMPTY_PHONE_CHAT: PhoneChatState = { messages: [], look: null };

// Le serveur redonne son état entier à la reconnexion du flux : il garde ses derniers messages, sans ceux qui ont été supprimés. Ce que le
// téléphone avait déjà reste ; un message qu'il connaît, plus récent que le plus ancien du serveur et que le serveur ne garde plus, a été
// supprimé pendant la coupure ; un message plus ancien que tout ce que le serveur garde reste tel quel (le serveur l'a oublié, pas supprimé).
// Un serveur sans message (redémarré) ne dit rien sur les anciens.
const toMergedMessages = (known: PhoneChatMessage[], snapshot: ChatMessage[]): PhoneChatMessage[] => {
  const oldest = snapshot[0]?.receivedAt;
  const kept = new Set(snapshot.map(({ id }) => id));
  const knownIds = new Set(known.map(({ message }) => message.id));
  const checked = known.map((entry) =>
    kept.has(entry.message.id) || entry.isDeleted || oldest === undefined || entry.message.receivedAt < oldest
      ? entry
      : { ...entry, isDeleted: true },
  );
  const added = snapshot
    .filter(({ id }) => !knownIds.has(id))
    .map((message): PhoneChatMessage => ({ message, isDeleted: false }));
  return [...checked, ...added].sort((first, second) => first.message.receivedAt - second.message.receivedAt);
};

export const toNextPhoneChat = (state: PhoneChatState, event: ChatEvent): PhoneChatState => {
  switch (event.kind) {
    case "snapshot":
      return { messages: toMergedMessages(state.messages, event.messages), look: event.look };
    case "message":
      if (state.messages.some(({ message }) => message.id === event.message.id)) return state;
      return { ...state, messages: [...state.messages, { message: event.message, isDeleted: false }] };
    case "delete": {
      const deleted = new Set(event.messageIds);
      return {
        ...state,
        messages: state.messages.map((entry) =>
          deleted.has(entry.message.id) ? { ...entry, isDeleted: true } : entry,
        ),
      };
    }
    case "look":
      return { ...state, look: event.look };
  }
};

// OBS ne montre pas ce message : une commande ou un bot (`isHidden`), sauf si le réglage du tchat de la page les montre. L'allure pas
// encore reçue vaut le réglage par défaut : on les masque.
export const isHiddenInObs = ({ isHidden }: ChatMessage, look: ChatLook | null): boolean =>
  isHidden && !(look?.shouldShowHidden ?? false);

// Ce que le téléphone dit d'un message à côté de son texte : supprimé (le plus fort, le message n'existe plus pour personne), masqué dans
// OBS, ou rien.
export type PhoneChatMark = "deleted" | "hidden" | null;

export const toPhoneChatMark = (
  { message, isDeleted }: PhoneChatMessage,
  look: ChatLook | null,
): PhoneChatMark => {
  if (isDeleted) return "deleted";
  return isHiddenInObs(message, look) ? "hidden" : null;
};
