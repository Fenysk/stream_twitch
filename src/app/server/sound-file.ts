import { defineHandler } from "nitro";
import { getRuntime } from "./runtime";

// Le fichier audio d'un son, demandé par « Écouter » et par la page /sounds. L'adresse porte la version (?v=) : un fichier
// servi sous une adresse ne change plus, le cache peut le garder.
export default defineHandler((event) => {
  const audio = getRuntime().sounds.getAudio(String(event.context.params?.id ?? ""));
  if (!audio) return new Response("Son inconnu.", { status: 404 });
  return new Response(Uint8Array.from(audio.bytes), {
    headers: { "content-type": audio.mime, "cache-control": "public, max-age=31536000, immutable" },
  });
});
