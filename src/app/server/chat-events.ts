import { defineHandler } from "nitro";
import type { ChatEvent } from "../../domain/chat.schema";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

let openPages = 0;

// Flux SSE du tchat : l'état à la connexion (messages récents et allure), puis chaque message, suppression et changement d'allure.
export default defineHandler(() => {
  const { chat } = getRuntime();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      send(chat.feed.getSnapshot());
      unsubscribe = chat.feed.subscribe(send);
      openPages += 1;
      log(`Page du tchat connectée (${openPages} ouverte${openPages > 1 ? "s" : ""}).`);
    },
    cancel() {
      unsubscribe?.();
      openPages -= 1;
      log(`Page du tchat déconnectée (${openPages} ouverte${openPages > 1 ? "s" : ""}).`);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  });
});
