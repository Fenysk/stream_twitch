import { defineHandler } from "nitro";
import type { ChatEvent } from "../../domain/chat.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";

// Flux SSE du tchat : l'état à la connexion (messages récents et allure), puis chaque message, suppression et changement d'allure.
export default defineHandler(() => {
  const { chat } = getRuntime();
  return toEventStream<ChatEvent>("du tchat", (send) => {
    send(chat.feed.getSnapshot());
    return chat.feed.subscribe(send);
  });
});
