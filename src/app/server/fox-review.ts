import { defineHandler } from "nitro";
import { isJson, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// « Faire le bilan » : le bilan du live part dans la file du renard, devant les messages ; la réponse rend ce qu'il va dire. Rien
// à dire (personne n'a écrit depuis le démarrage du serveur) : un refus.
export default defineHandler((event) => {
  const request = event.req;
  if (request.method !== "POST") return refuse(405, "méthode non permise");
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  const result = getRuntime().review.say();
  return result.ok ? json({ text: result.text }) : refuse(409, result.message);
});
