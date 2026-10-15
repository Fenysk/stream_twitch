import { defineHandler } from "nitro";
import type { SoundEvent } from "../../domain/sound.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";

// Flux SSE de la page /sounds : un `play` pour chaque son à jouer, un `stop` pour se taire. Rien n'est envoyé à la connexion :
// une page qui arrive ne rejoue pas un son passé.
export default defineHandler(() => {
  const { soundQueue } = getRuntime();
  return toEventStream<SoundEvent>("des sons", (send) => soundQueue.subscribe(send));
});
