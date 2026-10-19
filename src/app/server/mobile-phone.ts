import { defineHandler } from "nitro";
import { type PhoneEvent, PhoneQuerySchema } from "../../domain/phone.schema";
import { toEventStream } from "./event-stream";
import { getSearch } from "./http";
import { openPhoneStream } from "./phone-stream";
import { getRuntime } from "./runtime";

// Flux SSE d'un téléphone ouvert sur /mobile (`?id=…&role=…&number=…`) : son numéro de caméra, la page OBS de ce numéro et les signaux
// de cette page, et, pour la régie, l'état de la régie, plus un battement `keepalive`. Le numéro d'adresse est celui que le téléphone a
// gardé : il le reprend s'il est libre.
export default defineHandler((event) => {
  const opening = getSearch(event.req, PhoneQuerySchema);
  if (opening instanceof Response) return opening;
  const { phones, control } = getRuntime();
  return toEventStream<PhoneEvent, null>("d'un téléphone", (send, sendNamed) =>
    openPhoneStream({ phones, control }, opening, send, sendNamed),
  );
});
