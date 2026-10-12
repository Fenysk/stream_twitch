// L'image d'une emote sur le CDN de Twitch : animée quand elle l'est, pour fond sombre (la colonne l'est toujours), 56 px.
export const toEmoteUrl = (id: string): string =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`;
