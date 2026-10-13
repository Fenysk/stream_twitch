import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type StoredEmotes, toStoredEmotes, toStoredText } from "../domain/emote-sync.rules";
import type { EmoteStorePort } from "../usecase/emote-sync.usecase";

// Les dernières listes d'emotes reçues (data/emotes.txt, hors de git) : de quoi filtrer les emotes quand un service est en
// panne ou que le PC est hors ligne. Un fichier absent n'est pas un problème ; un fichier abîmé est ignoré, et signalé.
export function createEmoteStore(path: string, log: (message: string) => void): EmoteStorePort {
  return {
    get(): StoredEmotes | undefined {
      if (!existsSync(path)) return undefined;
      try {
        const stored = toStoredEmotes(readFileSync(path, "utf8"));
        if (stored) return stored;
        log(`Emotes : ${path} ignoré, ce n'est pas la liste que le serveur écrit`);
      } catch (error) {
        log(`Emotes : ${path} ignoré, ${error instanceof Error ? error.message : String(error)}`);
      }
      return undefined;
    },
    // Écriture atomique : une coupure ne laisse jamais un fichier à moitié écrit.
    update(stored: StoredEmotes): void {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, toStoredText(stored));
      renameSync(temporary, path);
    },
  };
}
