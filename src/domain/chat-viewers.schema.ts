import { z } from "zod";

// Une personne connectée au chat de la chaîne, telle que la régie la montre : son identifiant Twitch et son pseudo.
export const ChatViewerSchema = z.object({ id: z.string().min(1), nickname: z.string().min(1) });
export type ChatViewer = z.infer<typeof ChatViewerSchema>;

// La réponse de `GET /api/chat/viewers` : la liste, déjà triée par pseudo.
export const ChatViewersAnswerSchema = z.object({ viewers: z.array(ChatViewerSchema) });
