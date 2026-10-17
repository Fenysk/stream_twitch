import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// Ce que la page `/show` demande d'un clip confirmé juste avant de le jouer (`?name=`, `?v=` : la version reçue avec le clip) : son
// tchat placé sur le clip, les instants où son son fait sursauter Jean-Renard, la durée d'un sursaut. Le son d'un clip d'avant les
// spikes se mesure à ce moment-là (ffmpeg, ~1 s), puis ses spikes sont gardés dans son JSON.
export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return refuse(405, "méthode non permise");
  const params = new URL(event.req.url, "http://localhost").searchParams;
  const cues = await getRuntime().clips.getShowCues(params.get("name") ?? "", params.get("v") ?? undefined);
  return cues.ok ? json(cues.value) : refuse(cues.status, cues.message);
});
