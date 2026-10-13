import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TwitchTokenSchema } from "../domain/twitch.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import type { TokenStorePort } from "../usecase/twitch-connection.usecase";

// Le jeton d'Alexis dans un fichier (data/twitch-token.json, hors de git). Le journal dit pourquoi un fichier est refusé, jamais
// ce qu'il contient.
export function createTwitchTokenStore(path: string, log: (message: string) => void): TokenStorePort {
  return {
    get() {
      if (!existsSync(path)) return null;
      try {
        const parsed = TwitchTokenSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
        if (parsed.success) return parsed.data;
        log(`Twitch : ${path} ignoré, il est incomplet (${toIssuesMessage(parsed.error)}).`);
      } catch {
        log(`Twitch : ${path} ignoré, ce n'est pas du JSON.`);
      }
      return null;
    },
    update(token) {
      mkdirSync(dirname(path), { recursive: true });
      // Écrit à côté puis renommé : un arrêt en plein écriture ne laisse jamais un jeton coupé en deux.
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, path);
    },
    delete() {
      rmSync(path, { force: true });
    },
  };
}
