import { ObsIdsFileSchema } from "../domain/obs-ids.schema";
import type { ObsIdsStore } from "../usecase/obs-ids.usecase";
import { createJsonFileStore } from "./json-file.gateway";

// Les identifiants d'OBS retenus pour les réglages dans un fichier (data/obs-ids.json, hors de git).
export const createObsIdsStore = (path: string, log: (message: string) => void): ObsIdsStore =>
  createJsonFileStore({ path, schema: ObsIdsFileSchema, empty: undefined, label: "Suivi d'OBS" }, log);
