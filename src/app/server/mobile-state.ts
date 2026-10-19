import { defineHandler } from "nitro";
import type { MobileState, PhoneSummary } from "../../domain/phone.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";

// Flux SSE de l'onglet « Mobile » : l'origine des téléphones (`mobileOrigin`) et les téléphones connectés, à la connexion puis à chaque
// changement.
export default defineHandler(() => {
  const { phones, settings } = getRuntime();
  const toState = (list: PhoneSummary[]): MobileState => ({
    origin: settings.getState().effective.mobileOrigin ?? null,
    phones: list,
  });
  return toEventStream<MobileState>("de l'onglet Mobile", (send) => {
    send(toState(phones.getState()));
    return phones.subscribe((list) => send(toState(list)));
  });
});
