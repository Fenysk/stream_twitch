import { defineHandler } from "nitro";
import { NumberRequestSchema } from "../../domain/phone.schema";
import { getBody, json, refuse } from "./http";
import { getRuntime } from "./runtime";

// POST /api/mobile/number : le téléphone prend un autre numéro de caméra. 409 quand un autre téléphone l'a déjà.
export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return refuse(405, "méthode non permise");
  const request = await getBody(event.req, NumberRequestSchema);
  if (request instanceof Response) return request;
  const result = getRuntime().phones.updateNumber(request.phoneId, request.number);
  return result.ok ? json({ number: result.number }) : refuse(result.status, result.message);
});
