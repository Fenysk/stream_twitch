import { defineHandler } from "nitro";
import type { HeadView } from "../../domain/head.types";
import { getRuntime } from "./runtime";
import { log } from "./server-log";

let openPages = 0;

// Flux SSE : l'état de la tête à la connexion, puis à chaque changement.
export default defineHandler(() => {
  const { feed } = getRuntime();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (view: HeadView) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(view)}\n\n`));
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      send(feed.getView());
      unsubscribe = feed.subscribe(send);
      openPages += 1;
      log(`Page connectée (${openPages} ouverte${openPages > 1 ? "s" : ""}).`);
    },
    cancel() {
      unsubscribe?.();
      openPages -= 1;
      log(`Page déconnectée (${openPages} ouverte${openPages > 1 ? "s" : ""}).`);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  });
});
