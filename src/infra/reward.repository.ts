import { RewardRecordsFileSchema } from "../domain/reward.schema";
import type { RewardRecordStore } from "../usecase/reward.usecase";
import { createJsonFileStore } from "./json-file.gateway";

// Les enregistrements des rewards dans un fichier (data/rewards.json, hors de git) : le sound de chaque reward, et les rewards que
// l'app a créés.
export const createRewardStore = (path: string, log: (message: string) => void): RewardRecordStore =>
  createJsonFileStore({ path, schema: RewardRecordsFileSchema, empty: {}, label: "Récompenses" }, log);
