import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/obs/stream/stop : le bouton « Live » de la régie, une fois confirmé, arrête la diffusion dans OBS (StopStream). Sans corps.
// 409 quand le live n'est pas en cours ou qu'OBS refuse (non joint, refus d'OBS).
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const result = await getRuntime().control.stopLive();
  return result.ok ? json({}) : refuse(result.status, result.message);
});
