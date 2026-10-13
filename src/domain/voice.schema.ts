import { z } from "zod";

// Une voix de synthèse de Windows : son nom d'affichage (« Microsoft Claude ») et sa langue (« fr-CA »).
export const VoiceSchema = z.object({ name: z.string().min(1), language: z.string().min(1) });
export type Voice = z.infer<typeof VoiceSchema>;

export const VoicesSchema = z.object({ voices: z.array(VoiceSchema) });
