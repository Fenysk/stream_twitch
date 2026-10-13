import { defineHandler } from "nitro";
import type { HeadView } from "../../domain/head.types";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";

// Flux SSE : l'état de la tête à la connexion, puis à chaque changement.
export default defineHandler(() => {
  const { feed } = getRuntime();
  return toEventStream<HeadView>("", (send) => {
    send(feed.getView());
    return feed.subscribe(send);
  });
});
