import { z } from "zod";

// Le jeton d'Alexis, tel que data/twitch-token.json le garde. À plat (pas de liste) : Biome laisse un fichier JSON à plat tel
// qu'il l'a trouvé, et le fichier se relit sans le défaire.
export const TwitchTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  // L'instant (ms depuis 1970) où le jeton d'accès cesse de valoir.
  expiresAt: z.number(),
  // Le compte qui s'est connecté : son nom (pour l'afficher) et son identifiant (le modérateur d'EventSub).
  login: z.string().min(1),
  userId: z.string().min(1),
  // Les droits que Twitch a donnés, séparés par des espaces.
  scope: z.string(),
});
export type TwitchToken = z.infer<typeof TwitchTokenSchema>;

// Ce que le renard écoute par EventSub : les follows, les récompenses de points de chaîne et les prédictions terminées. Chacun
// demande un droit du jeton (twitch.rules.ts).
export const TWITCH_TOPICS = ["follow", "reward", "prediction"] as const;
export const TwitchTopicSchema = z.enum(TWITCH_TOPICS);
export type TwitchTopic = z.infer<typeof TwitchTopicSchema>;

// Ce que les pages savent de la connexion à Twitch : jamais le jeton. `unavailable` : les identifiants de l'application
// manquent dans .env. `lastError` : pourquoi la dernière tentative de connexion a échoué, ou `null`. `missing` : ce que le
// jeton gardé ne permet pas d'écouter (il faut se reconnecter).
export const TwitchStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("disconnected"), lastError: z.string().nullable() }),
  z.object({ kind: z.literal("connected"), login: z.string().min(1), missing: z.array(TwitchTopicSchema) }),
]);
export type TwitchStatus = z.infer<typeof TwitchStatusSchema>;
