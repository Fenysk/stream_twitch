import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RegularsFileSchema } from "../domain/regulars.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import type { RegularsPort } from "../usecase/fox-regulars.usecase";
import { getJsonFile } from "./json-file.gateway";

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Les viewers connus dans un fichier (data/viewers.json, hors de git). Un fichier absent n'est pas un problème. Un fichier
// illisible est mis de côté (`.invalid`) et signalé : le suivant ne l'écrase pas.
export function createRegularsStore(path: string, log: (message: string) => void): RegularsPort {
  const moveAside = (reason: string) => {
    const aside = `${path}.invalid`;
    try {
      renameSync(path, aside);
      log(`Habitués : ${path} mis de côté dans ${aside} (${reason}), un fichier neuf le remplace.`);
    } catch (error) {
      log(`Habitués : ${path} illisible (${reason}) et impossible à mettre de côté : ${toMessage(error)}`);
    }
  };

  return {
    get() {
      if (!existsSync(path)) return undefined;
      try {
        const parsed = RegularsFileSchema.safeParse(getJsonFile(path));
        if (parsed.success) return parsed.data;
        moveAside(toIssuesMessage(parsed.error));
      } catch (error) {
        moveAside(toMessage(error));
      }
      return undefined;
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
