import { z } from "zod";

type ScaleFields = {
  threshold: number;
  quietLevel?: number | undefined;
  quietScale?: number | undefined;
  loudScale?: number | undefined;
  loudLevel?: number | undefined;
};

const hasAllOrNoneOfScale = ({ quietLevel, quietScale, loudScale, loudLevel }: ScaleFields): boolean => {
  const given = [quietScale, loudScale, loudLevel].filter((value) => value !== undefined).length;
  return given === 3 || (given === 0 && quietLevel === undefined);
};

const isLoudLevelAboveQuiet = ({ threshold, quietLevel, loudLevel }: ScaleFields): boolean =>
  loudLevel === undefined || loudLevel > (quietLevel ?? threshold);

// Format de `settings.json`, lu une fois au démarrage du serveur. `strict` : une faute de frappe est refusée, pas ignorée.
export const SettingsSchema = z
  .object({
    obsAddress: z.string().regex(/^wss?:\/\/.+/, "doit commencer par ws:// ou wss://"),
    micName: z.string().min(1),
    threshold: z.number().min(-100).max(0),
    delay: z.number().int().positive(),
    rhythm: z.number().int().positive().optional(),
    tilt: z.number().positive().optional(),
    opening: z.number().positive().optional(),
    quietLevel: z.number().min(-100).max(0).optional(),
    quietScale: z.number().positive().optional(),
    loudScale: z.number().positive().optional(),
    loudLevel: z.number().min(-100).max(0).optional(),
  })
  .strict()
  .refine(hasAllOrNoneOfScale, {
    message:
      "quietScale, loudScale et loudLevel vont ensemble : tous les trois ou aucun (quietLevel les accompagne)",
  })
  .refine(isLoudLevelAboveQuiet, {
    message: "loudLevel doit dépasser quietLevel (ou threshold quand il n'y a pas de quietLevel)",
    path: ["loudLevel"],
  });

export type Settings = z.infer<typeof SettingsSchema>;
