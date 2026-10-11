import { z } from "zod";

type ScaleFields = {
  threshold: number;
  quietLevel?: number | undefined;
  quietScale?: number | undefined;
  loudScale?: number | undefined;
  loudLevel?: number | undefined;
};

type IdleFields = {
  idleMin?: number | undefined;
  idleMax?: number | undefined;
  idleAngle?: number | undefined;
  idleLift?: number | undefined;
};

const hasAllOrNoneOfScale = ({ quietLevel, quietScale, loudScale, loudLevel }: ScaleFields): boolean => {
  const given = [quietScale, loudScale, loudLevel].filter((value) => value !== undefined).length;
  return given === 3 || (given === 0 && quietLevel === undefined);
};

const hasAllOrNoneOfIdle = ({ idleMin, idleMax, idleAngle, idleLift }: IdleFields): boolean => {
  const given = [idleMin, idleMax, idleAngle, idleLift].filter((value) => value !== undefined).length;
  return given === 0 || given === 4;
};

const isIdleMaxAboveMin = ({ idleMin, idleMax }: IdleFields): boolean =>
  idleMin === undefined || idleMax === undefined || idleMax >= idleMin;

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
    idleMin: z.number().positive().optional(),
    idleMax: z.number().positive().optional(),
    idleAngle: z.number().positive().optional(),
    idleLift: z.number().positive().optional(),
  })
  .strict()
  .refine(hasAllOrNoneOfScale, {
    message:
      "quietScale, loudScale et loudLevel vont ensemble : tous les trois ou aucun (quietLevel les accompagne)",
  })
  .refine(isLoudLevelAboveQuiet, {
    message: "loudLevel doit dépasser quietLevel (ou threshold quand il n'y a pas de quietLevel)",
    path: ["loudLevel"],
  })
  .refine(hasAllOrNoneOfIdle, {
    message: "idleMin, idleMax, idleAngle et idleLift vont ensemble : tous les quatre ou aucun",
  })
  .refine(isIdleMaxAboveMin, {
    message: "idleMax ne peut pas être plus petit que idleMin",
    path: ["idleMax"],
  });

export type Settings = z.infer<typeof SettingsSchema>;
