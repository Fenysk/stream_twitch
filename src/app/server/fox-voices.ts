import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// Les voix françaises installées sur ce PC, pour le choix de l'onglet Renard.
export default defineHandler(async () => {
  const result = await getRuntime().fox.listVoices();
  return result.ok ? json({ voices: result.voices }) : refuse(502, result.message);
});
