import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// Les scènes d'OBS, pour le choix de la scène après l'émission (onglet Émission).
export default defineHandler(async () => {
  const result = await getRuntime().obs.listScenes();
  return result.ok ? json({ scenes: result.scenes }) : refuse(502, result.reason);
});
