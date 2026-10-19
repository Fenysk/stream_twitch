import { defineHandler } from "nitro";
import { type ScreenEvent, ScreenQuerySchema } from "../../domain/phone.schema";
import { toEventStream } from "./event-stream";
import { getSearch } from "./http";
import { getRuntime } from "./runtime";

// Flux SSE de la page OBS d'une caméra (`?id=…&number=…`) : si son téléphone est là, et ses signaux. Une seule connexion par page.
export default defineHandler((event) => {
  const opening = getSearch(event.req, ScreenQuerySchema);
  if (opening instanceof Response) return opening;
  const { phones } = getRuntime();
  return toEventStream<ScreenEvent>("d'une caméra", (send) => phones.openScreen(opening, send));
});
