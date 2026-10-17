import { copyFileSync, createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import {
  isClipName,
  toChatFileName,
  toClipStem,
  toConfirmationName,
  toConfirmedName,
  toFreeName,
} from "../domain/clip.rules";
import { ClipChatSchema, type ClipConfirmation, ClipConfirmationSchema } from "../domain/clip.schema";
import { toLaughsJson } from "../domain/laugh.rules";
import { toIssuesMessage } from "../shared/zod-issues";
import type { ClipEntry, ClipKind, ClipStore, ConfirmedClip } from "../usecase/clip.usecase";
import type { ClipChatStore } from "../usecase/clip-chat.usecase";
import {
  CONFIRMED_FOLDER,
  hasVideo,
  listFileNames,
  moveToProcessedFolder,
  PROCESSED_FOLDER,
  replaceConfirmedVideo,
  toProcessedName,
  toTakenNames,
  toVersion,
  withdrawConfirmed,
  writeAtomic,
} from "./clip-files.repository";
import { getJsonFile } from "./json-file.gateway";

export { CONFIRMED_FOLDER, PROCESSED_FOLDER };

// Un morceau de vidéo lu à la fois : 1 Mo, de quoi tenir plusieurs dizaines de Mo/s sans charger le fichier.
const CHUNK_BYTES = 1024 * 1024;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

// Un fichier lu par morceaux à la demande (le lecteur ralentit, le disque aussi) ; le fermer arrête la lecture du fichier.
// `Readable.toWeb` rend le ReadableStream de Node, que les types du DOM (Response) refusent.
const toWebStream = (stream: Readable): ReadableStream<Uint8Array> => {
  const chunks = stream[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      stream.destroy();
    },
  });
};

// Le dossier où vit chaque sorte de clip : `<dossier>` pour les clips bruts, `<dossier>\Confirmés` pour les clips recodés et leur
// JSON, `<dossier>\Traités` pour les clips bruts déjà vus.
const toDirectory = (folder: string, kind: ClipKind): string => {
  const root = resolve(folder);
  if (kind === "raw") return root;
  return join(root, kind === "confirmed" ? CONFIRMED_FOLDER : PROCESSED_FOLDER);
};

export function createClipStore(log: (message: string) => void): ClipStore {
  // Un JSON invalide se signale une fois, pas à chaque liste.
  const warned = new Set<string>();
  const warnOnce = (path: string, reason: string): void => {
    if (warned.has(path)) return;
    warned.add(path);
    log(`Clips : ${path} ignoré : ${reason}`);
  };

  // Le JSON d'un clip confirmé (l'ancien `laugh` lu comme un rire à la fin) ; un JSON abîmé ou invalide se signale une fois et le clip
  // n'existe pas.
  const getConfirmation = (directory: string, jsonName: string): ClipConfirmation | undefined => {
    try {
      const parsed = ClipConfirmationSchema.safeParse(toLaughsJson(getJsonFile(join(directory, jsonName))));
      if (parsed.success) return parsed.data;
      if (!warned.has(jsonName)) log(`Clips : ${jsonName} ignoré : ${toIssuesMessage(parsed.error)}`);
    } catch (error) {
      if (!warned.has(jsonName)) log(`Clips : ${jsonName} ignoré : ${toMessage(error)}`);
    }
    warned.add(jsonName);
    return undefined;
  };

  // Un clip confirmé : son JSON, la version de sa vidéo, et son clip brut dans Traités (`processedName` du JSON, ou `rawName` pour un
  // JSON d'avant) quand il y est encore.
  const toConfirmed = (root: string, videoName: string, json: ClipConfirmation): ConfirmedClip => {
    const { processedName, ...confirmation } = json;
    const candidate = processedName ?? confirmation.rawName;
    return {
      ...confirmation,
      name: videoName,
      version: toVersion(join(root, CONFIRMED_FOLDER, videoName)),
      processedName: hasVideo(join(root, PROCESSED_FOLDER), candidate) ? candidate : null,
    };
  };

  return {
    listRaw(folder) {
      const directory = resolve(folder);
      return listFileNames(directory)
        .filter(isClipName)
        .flatMap((name): ClipEntry[] => {
          const path = join(directory, name);
          try {
            const { size, mtimeMs } = statSync(path);
            return [{ name, path, size, modifiedAt: Math.round(mtimeMs) }];
          } catch (error) {
            log(`Clips : « ${name} » a disparu pendant la lecture du dossier (${toMessage(error)}).`);
            return [];
          }
        });
    },
    listConfirmed(folder) {
      const directory = toDirectory(folder, "confirmed");
      if (!existsSync(directory)) return [];
      const names = listFileNames(directory);
      const available = new Set(names);
      return names
        .filter(isClipName)
        .filter((name) => available.has(toConfirmationName(name)))
        .sort((a, b) => a.localeCompare(b))
        .flatMap((name) => {
          const json = getConfirmation(directory, toConfirmationName(name));
          return json ? [toConfirmed(resolve(folder), name, json)] : [];
        });
    },
    openVideo(folder, kind, name) {
      const directory = toDirectory(folder, kind);
      if (!hasVideo(directory, name)) return undefined;
      const path = join(directory, name);
      return {
        size: statSync(path).size,
        version: toVersion(path),
        read: (start, end) => toWebStream(createReadStream(path, { start, end, highWaterMark: CHUNK_BYTES })),
      };
    },
    planConfirm(folder, rawName) {
      const directory = resolve(folder);
      if (!hasVideo(directory, rawName)) return undefined;
      const confirmed = join(directory, CONFIRMED_FOLDER);
      mkdirSync(confirmed, { recursive: true });
      // Un `.partial` resté d'un recodage interrompu ne prend pas le nom : le prochain recodage l'écrase.
      const taken = toTakenNames(confirmed);
      const name = toFreeName(toConfirmedName(rawName), (candidate) =>
        [candidate, toConfirmationName(candidate), toChatFileName(candidate)].some((file) =>
          taken.has(file.toLowerCase()),
        ),
      );
      return {
        inputPath: join(directory, rawName),
        outputPath: join(confirmed, `${toClipStem(name)}.partial`),
        name,
      };
    },
    commitConfirm(folder, rawName, plan, confirmation) {
      const directory = resolve(folder);
      const confirmed = join(directory, CONFIRMED_FOLDER);
      const created: string[] = [];
      try {
        renameSync(plan.outputPath, join(confirmed, plan.name));
        created.push(join(confirmed, plan.name));
        const processedName = toProcessedName(directory, rawName);
        writeAtomic(
          join(confirmed, toConfirmationName(plan.name)),
          toJsonText({ ...confirmation, processedName }),
        );
        created.push(join(confirmed, toConfirmationName(plan.name)));
        const rawChat = join(directory, toChatFileName(rawName));
        if (existsSync(rawChat)) {
          copyFileSync(rawChat, join(confirmed, toChatFileName(plan.name)));
          created.push(join(confirmed, toChatFileName(plan.name)));
        }
        moveToProcessedFolder(directory, rawName, processedName);
      } catch (error) {
        for (const path of created) rmSync(path, { force: true });
        throw error;
      }
    },
    cancelConfirm(plan) {
      rmSync(plan.outputPath, { force: true });
    },
    moveToProcessed(folder, rawName) {
      const directory = resolve(folder);
      if (!hasVideo(directory, rawName)) return undefined;
      const processedName = toProcessedName(directory, rawName);
      moveToProcessedFolder(directory, rawName, processedName);
      return processedName;
    },
    updateConfirmation(folder, name, confirmation) {
      const directory = toDirectory(folder, "confirmed");
      if (!hasVideo(directory, name)) throw new Error(`le clip confirmé « ${name} » n'existe plus`);
      writeAtomic(join(directory, toConfirmationName(name)), toJsonText(confirmation));
    },
    planReplace(folder, name, processedName) {
      const confirmed = toDirectory(folder, "confirmed");
      if (!hasVideo(confirmed, name) || !hasVideo(toDirectory(folder, "processed"), processedName))
        return undefined;
      return {
        inputPath: join(toDirectory(folder, "processed"), processedName),
        outputPath: join(confirmed, `${toClipStem(name)}.partial`),
        name,
      };
    },
    commitReplace: (folder, plan, confirmation) =>
      replaceConfirmedVideo(resolve(folder), plan, toJsonText(confirmation)),
    async withdraw(folder, name) {
      const directory = resolve(folder);
      return hasVideo(toDirectory(folder, "confirmed"), name)
        ? withdrawConfirmed(directory, name)
        : undefined;
    },
    pathOf(folder, kind, name) {
      const directory = toDirectory(folder, kind);
      return hasVideo(directory, name) ? join(directory, name) : undefined;
    },
    getChat(folder, name) {
      const path = join(toDirectory(folder, "confirmed"), toChatFileName(name));
      if (!existsSync(path)) return undefined;
      try {
        const parsed = ClipChatSchema.safeParse(getJsonFile(path));
        if (parsed.success) return parsed.data;
        warnOnce(path, toIssuesMessage(parsed.error));
      } catch (error) {
        warnOnce(path, toMessage(error));
      }
      return undefined;
    },
  };
}

// Windows ne distingue pas les majuscules d'un chemin ; OBS écrit le sien avec des / ou des \, resolve les ramène à la même forme.
const isSamePath = (a: string, b: string): boolean =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

// Le tchat d'un clip s'écrit à côté de lui, sous son nom sans l'extension (`.chat.json`) : seulement pour un clip vidéo qui existe
// et qui est directement dans le dossier des clips.
export function createClipChatStore(): ClipChatStore {
  return {
    create(folder, clipPath, chat) {
      const clip = resolve(clipPath);
      if (!isSamePath(dirname(clip), resolve(folder))) return "outside";
      if (!isClipName(basename(clip)) || !existsSync(clip)) return "missing";
      writeAtomic(join(dirname(clip), toChatFileName(basename(clip))), toJsonText(chat));
      return "written";
    },
  };
}
