import { defineHandler } from "nitro";
import type { SettingsView } from "../../domain/settings.schema";
import { toEventStream } from "./event-stream";
import { getRuntime } from "./runtime";
import { openSettingsStream } from "./settings-stream";

// Flux SSE des réglages : leur vue à la connexion puis à chaque changement (le plugin Stream Deck n'attend plus la relecture de 10 s).
export default defineHandler(() => {
  const { settings } = getRuntime();
  return toEventStream<SettingsView, null>("des réglages", (send, sendNamed) =>
    openSettingsStream({ settings }, send, sendNamed),
  );
});
