import { z } from "zod";

// Ce que le serveur retient d'un viewer connu (data/viewers.json), jamais le contenu de ses messages. Les instants sont en ms.
export const RegularSchema = z.object({
  firstSeen: z.number().int().min(0),
  lastSeen: z.number().int().min(0),
  lives: z.number().int().min(1),
});
export type Regular = z.infer<typeof RegularSchema>;

// Le fichier : sa date de création, et les viewers par login en minuscules.
export const RegularsFileSchema = z.object({
  createdAt: z.number().int().min(0),
  viewers: z.record(z.string().min(1), RegularSchema),
});
export type RegularsFile = z.infer<typeof RegularsFileSchema>;
