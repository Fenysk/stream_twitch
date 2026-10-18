import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";
import { toIssuesMessage } from "../shared/zod-issues";

// Un fichier JSON du dépôt : l'erreur nomme le fichier, que le journal du serveur affiche tel quel.
export function getJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${path} est introuvable ou illisible`, { cause: error });
  }
  try {
    // Notepad et d'autres éditeurs Windows écrivent un BOM en tête : JSON.parse le refuse.
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${path} n'est pas du JSON valide`, { cause: error });
  }
}

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type JsonFileStoreSettings<Schema extends z.ZodType, Empty> = {
  path: string;
  schema: Schema;
  // Ce que `get` rend quand le fichier est absent ou a été mis de côté.
  empty: Empty;
  // Le début des lignes du journal : « Habitués », « Récompenses »…
  label: string;
};

// Un fichier de data/ (hors de git) lu et écrit d'un bloc. Un fichier absent n'est pas un problème. Un fichier illisible est mis de
// côté (`.invalid`) et signalé : le suivant ne l'écrase pas.
export function createJsonFileStore<Schema extends z.ZodType, Empty>(
  { path, schema, empty, label }: JsonFileStoreSettings<Schema, Empty>,
  log: (message: string) => void,
): { get(): z.output<Schema> | Empty; update(file: z.output<Schema>): void } {
  const moveAside = (reason: string) => {
    const aside = `${path}.invalid`;
    try {
      renameSync(path, aside);
      log(`${label} : ${path} mis de côté dans ${aside} (${reason}), un fichier neuf le remplace.`);
    } catch (error) {
      log(`${label} : ${path} illisible (${reason}) et impossible à mettre de côté : ${toMessage(error)}`);
    }
  };

  return {
    get() {
      if (!existsSync(path)) return empty;
      try {
        const parsed = schema.safeParse(getJsonFile(path));
        if (parsed.success) return parsed.data;
        moveAside(toIssuesMessage(parsed.error));
      } catch (error) {
        moveAside(toMessage(error));
      }
      return empty;
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
