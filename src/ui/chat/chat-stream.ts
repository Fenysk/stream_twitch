import { type ChatEvent, ChatEventSchema } from "../../domain/chat.schema";

// Le flux du tchat du serveur, pour toutes les pages qui l'affichent : EventSource se reconnecte seul s'il tombe, et le serveur renvoie
// alors l'état entier. Chaque évènement lisible va à `onEvent` ; rend de quoi fermer le flux.
export const watchChat = (onEvent: (event: ChatEvent) => void): (() => void) => {
  const source = new EventSource("/api/chat/events");
  source.onmessage = (event: MessageEvent<string>) => {
    const parsed = ChatEventSchema.safeParse(JSON.parse(event.data));
    if (parsed.success) onEvent(parsed.data);
    else console.error("Message du tchat illisible :", parsed.error.message);
  };
  return () => source.close();
};
