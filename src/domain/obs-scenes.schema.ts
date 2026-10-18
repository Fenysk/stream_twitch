import { z } from "zod";

// Les noms des scènes d'OBS, dans l'ordre d'OBS : ce que l'API rend à l'onglet Émission.
export const ObsScenesSchema = z.object({ scenes: z.array(z.string().min(1)) });
