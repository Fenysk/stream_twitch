import { defineHandler } from "nitro";
import type { PictureState } from "../../domain/picture.schema";
import { toEventStream } from "./event-stream";
import { openPictureStream } from "./picture-stream";
import { getRuntime } from "./runtime";

// GET /api/obs/picture/events : flux SSE de l'image (qui est à l'image dans la place caméra) à la connexion puis à chaque changement. Le
// plugin Stream Deck l'écoute pour écrire l'image en cours sur sa touche « Image ».
export default defineHandler(() => {
  const { control } = getRuntime();
  return toEventStream<PictureState, null>("de l'image", (send, sendNamed) =>
    openPictureStream({ control }, send, sendNamed),
  );
});
