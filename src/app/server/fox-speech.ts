import { defineHandler } from "nitro";
import { getRuntime } from "./runtime";

// Le WAV d'une phrase, demandé par chaque page qui en a reçu l'adresse ; il ne sert qu'une minute (usecase).
export default defineHandler((event) => {
  const bytes = getRuntime().fox.getSpeech(String(event.context.params?.id ?? ""));
  if (!bytes) return new Response("Voix inconnue.", { status: 404 });
  return new Response(Uint8Array.from(bytes), {
    headers: { "content-type": "audio/wav", "cache-control": "no-store" },
  });
});
