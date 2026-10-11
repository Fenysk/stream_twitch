import { z } from "zod";

// Ce que le serveur envoie au vumètre, une image après l'autre : le level du micro en dB, et si OBS est joint.
export const MicReadingSchema = z.object({ level: z.number(), isLinked: z.boolean() });
export type MicReading = z.infer<typeof MicReadingSchema>;
