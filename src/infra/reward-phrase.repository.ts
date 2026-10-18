import { RewardPhrasesFileSchema } from "../domain/reward-phrase.schema";
import type { RewardPhraseStore } from "../usecase/reward-phrase.usecase";
import { createJsonFileStore } from "./json-file.gateway";

// Les phrases des récompenses dans un fichier (data/reward-phrases.json, hors de git).
export const createRewardPhraseStore = (path: string, log: (message: string) => void): RewardPhraseStore =>
  createJsonFileStore(
    { path, schema: RewardPhrasesFileSchema, empty: {}, label: "Phrases des récompenses" },
    log,
  );
