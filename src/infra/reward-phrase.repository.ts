import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RewardPhrasesFileSchema } from "../domain/reward-phrase.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import type { RewardPhraseStore } from "../usecase/reward-phrase.usecase";
import { getJsonFile } from "./json-file.gateway";

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Les phrases des récompenses dans un fichier (data/reward-phrases.json, hors de git). Un fichier absent n'est pas un problème.
// Un fichier illisible est mis de côté (`.invalid`) et signalé : le suivant ne l'écrase pas.
export function createRewardPhraseStore(path: string, log: (message: string) => void): RewardPhraseStore {
  const moveAside = (reason: string) => {
    const aside = `${path}.invalid`;
    try {
      renameSync(path, aside);
      log(
        `Phrases des récompenses : ${path} mis de côté dans ${aside} (${reason}), un fichier neuf le remplace.`,
      );
    } catch (error) {
      log(
        `Phrases des récompenses : ${path} illisible (${reason}) et impossible à mettre de côté : ${toMessage(error)}`,
      );
    }
  };

  return {
    get() {
      if (!existsSync(path)) return {};
      try {
        const parsed = RewardPhrasesFileSchema.safeParse(getJsonFile(path));
        if (parsed.success) return parsed.data;
        moveAside(toIssuesMessage(parsed.error));
      } catch (error) {
        moveAside(toMessage(error));
      }
      return {};
    },
    // Écrit à côté puis renommé : un arrêt en pleine écriture ne laisse jamais un fichier coupé en deux.
    update(file) {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`);
      renameSync(temporary, path);
    },
  };
}
