import { z } from "zod";

// Les réglages qui nomment une entrée ou une scène d'OBS : le nom ne sert qu'à la trouver, le serveur la suit ensuite par son identifiant.
export const OBS_NAME_KEYS = ["micName", "desktopName", "cameraSlotScene", "showEndScene"] as const;
export type ObsNameKey = (typeof OBS_NAME_KEYS)[number];

// Ce que le serveur retient d'un réglage (data/obs-ids.json, hors de git) : le nom que le réglage portait quand la source a été
// trouvée, son identifiant d'OBS, et le nom qu'OBS lui donnait à la dernière lecture.
export const ObsIdRecordSchema = z.object({
  configuredName: z.string().min(1),
  uuid: z.string().min(1),
  name: z.string().min(1),
});
export type ObsIdRecord = z.infer<typeof ObsIdRecordSchema>;

export const ObsIdsFileSchema = z.object({ ids: z.partialRecord(z.enum(OBS_NAME_KEYS), ObsIdRecordSchema) });
export type ObsIdsFile = z.infer<typeof ObsIdsFileSchema>;
