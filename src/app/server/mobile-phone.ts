import { defineHandler } from "nitro";
import { type PhoneEvent, PhoneQuerySchema } from "../../domain/phone.schema";
import { toEventStream } from "./event-stream";
import { getSearch } from "./http";
import { openPhoneStream } from "./phone-stream";
import { getRuntime } from "./runtime";

// Flux SSE d'un téléphone ouvert sur /mobile (`?id=…&number=…`), le même qu'il filme ou non : l'état de la régie et un battement `keepalive`,
// et, tant qu'il filme (`POST /api/mobile/link`), son numéro de caméra, la page OBS de ce numéro et les signaux de cette page. Le numéro
// d'adresse est celui que le téléphone a gardé : il le reprend à son premier Filmer s'il est libre.
export default defineHandler((event) => {
  const query = getSearch(event.req, PhoneQuerySchema);
  if (query instanceof Response) return query;
  const { phones, control } = getRuntime();
  return toEventStream<PhoneEvent, null>("d'un téléphone", (send, sendNamed) =>
    openPhoneStream({ phones, control }, { id: query.id, number: query.number }, send, sendNamed),
  );
});
