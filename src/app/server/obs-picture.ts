import { defineHandler } from "nitro";
import { PictureRequestSchema } from "../../domain/picture.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/obs/picture (`{ id }`, `pc`, `head` ou `camera-3`) : ce membre de la place caméra passe à l'image dans OBS, les autres sont
// cachés, et le micro le suit (celui de la caméra choisie, sinon celui du PC) ; avec `isMicKept: true`, le micro du live ne bouge pas (le
// bouton qui coupe la caméra d'un téléphone). 404 : membre inconnu ; 409 : caméra dont le téléphone ne filme pas vers OBS, ou OBS refuse.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, PictureRequestSchema);
  if (request instanceof Response) return request;
  const result = await getRuntime().control.updatePicture(
    request.id,
    request.isMicKept ? { isMicKept: true } : {},
  );
  return result.ok ? json({}) : refuse(result.status, result.message);
});
