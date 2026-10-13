import { defineHandler } from "nitro";
import { getRuntime } from "./runtime";

// GET /auth/twitch/callback : Twitch y renvoie Alexis après l'autorisation, avec le code et le state (ou une erreur). Le serveur
// vérifie le state, échange le code contre un jeton et le garde, puis ramène Alexis sur l'onglet Renard, qui montre
// « Connecté en tant que … » ou la raison de l'échec. Rien du code ni du jeton ne passe dans l'adresse de retour.
export default defineHandler(async (event) => {
  const { searchParams } = new URL(event.req.url, "http://localhost");
  await getRuntime().twitch.completeLogin({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
  });
  return new Response(null, {
    status: 302,
    headers: { location: "/settings/fox", "cache-control": "no-store" },
  });
});
