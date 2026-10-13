// L'application Twitch (LivePlace) : son identifiant et son secret viennent de .env et ne sont jamais écrits dans le journal
// ni envoyés à une page.
export type TwitchApp = { clientId: string; clientSecret: string };

// `undefined` quand l'un des deux manque ou est vide : tout ce qui demande Twitch attend alors.
export function getTwitchApp(env: Readonly<Record<string, string | undefined>>): TwitchApp | undefined {
  const clientId = env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = env.TWITCH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}
