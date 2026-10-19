import { defineHandler } from "nitro";
import { refuse } from "./http";
import { getRuntime } from "./runtime";

// Le retour antenne de la régie : l'image JPEG de la scène du programme. Le téléphone la redemande à chaque image : jamais en cache.
export default defineHandler(async () => {
  const shot = await getRuntime().monitor.getImage();
  if (!shot.ok) return refuse(502, shot.reason);
  // Une copie : le tampon gardé 200 ms par le serveur est partagé entre les demandes.
  return new Response(Uint8Array.from(shot.bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
  });
});
