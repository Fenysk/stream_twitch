import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/obs/picture/next : la touche « Image » du Stream Deck. L'image passe au membre suivant de la place caméra (PC, caméras
// disponibles par numéro, tête, puis PC), micro compris. 409 : aucune image à choisir, ou OBS refuse. La demande n'a pas de corps.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const result = await getRuntime().control.updatePictureNext();
  return result.ok ? json({}) : refuse(result.status, result.message);
});
