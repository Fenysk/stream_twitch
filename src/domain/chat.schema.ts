import { z } from "zod";

export const CHAT_STYLES = ["pill", "text", "panel"] as const;
export const CHAT_ANIMATIONS = ["rise", "pop", "side", "fade"] as const;

export const ChatStyleSchema = z.enum(CHAT_STYLES, "doit être pill, text ou panel");
export const ChatAnimationSchema = z.enum(CHAT_ANIMATIONS, "doit être rise, pop, side ou fade");

// Une couleur de Twitch : #RRGGBB, jamais un nom ni une valeur CSS libre.
export const ChatColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Un message est découpé en morceaux de texte et en emotes (une image Twitch, retrouvée par son identifiant).
export const ChatFragmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("emote"), id: z.string().min(1), name: z.string() }),
]);

// Ce que le serveur envoie aux pages. `isHidden` : une commande ou un bot, que la page montre seulement si le réglage le demande.
export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  nickname: z.string().min(1),
  color: ChatColorSchema.nullable(),
  fragments: z.array(ChatFragmentSchema),
  isHidden: z.boolean(),
  receivedAt: z.number(),
});

// L'allure du tchat, telle que les réglages l'appliquent. `duration` en secondes, 0 : les messages restent.
export const ChatLookSchema = z.object({
  style: ChatStyleSchema,
  opacity: z.number().min(0).max(100),
  textSize: z.number().positive(),
  duration: z.number().min(0),
  maxMessages: z.number().int().positive(),
  animation: ChatAnimationSchema,
  shouldShowHidden: z.boolean(),
});

// Le flux du serveur vers les pages : l'état à la connexion, puis chaque changement.
export const ChatEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), messages: z.array(ChatMessageSchema), look: ChatLookSchema }),
  z.object({ kind: z.literal("message"), message: ChatMessageSchema }),
  z.object({ kind: z.literal("delete"), messageIds: z.array(z.string()) }),
  z.object({ kind: z.literal("look"), look: ChatLookSchema }),
]);

export type ChatStyle = z.infer<typeof ChatStyleSchema>;
export type ChatAnimation = z.infer<typeof ChatAnimationSchema>;
export type ChatFragment = z.infer<typeof ChatFragmentSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatLook = z.infer<typeof ChatLookSchema>;
export type ChatEvent = z.infer<typeof ChatEventSchema>;
