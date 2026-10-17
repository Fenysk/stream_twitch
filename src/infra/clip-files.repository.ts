import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isClipName,
  toChatFileName,
  toConfirmationName,
  toFreeName,
  toPreviousName,
} from "../domain/clip.rules";
import type { ConfirmPlan } from "../usecase/clip.usecase";

// Les deux sous-dossiers du dossier des clips : les clips recodés, et les clips bruts déjà vus.
export const CONFIRMED_FOLDER = "Confirmés";
export const PROCESSED_FOLDER = "Traités";

// Les fichiers (pas les sous-dossiers) d'un dossier.
export const listFileNames = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

// Un clip n'est lu que s'il est dans la liste du dossier : un nom qui n'y figure pas (chemin, périphérique Windows) n'ouvre rien.
export const hasVideo = (directory: string, name: string): boolean =>
  isClipName(name) && existsSync(directory) && listFileNames(directory).includes(name);

// Windows ne distingue pas les majuscules : « A.mp4 » et « a.mp4 » sont le même fichier.
export const toTakenNames = (directory: string): Set<string> =>
  new Set(listFileNames(directory).map((name) => name.toLowerCase()));

// La version d'une vidéo : sa date et sa taille. L'adresse que sert le serveur la porte, pour qu'une vidéo remplacée ne se confonde pas
// avec l'ancienne.
export const toVersion = (path: string): string => {
  const { mtimeMs, size } = statSync(path);
  return `${Math.round(mtimeMs)}-${size}`;
};

// Le fichier temporaire est écrit en entier, puis renommé par-dessus : une coupure ne laisse jamais un JSON à moitié écrit.
export const writeAtomic = (path: string, content: string): void => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RETRY_TRIES = 4;
const RETRY_MS = 250;

const toCode = (error: unknown): string =>
  error instanceof Error && "code" in error ? String(error.code) : "";

// Windows refuse parfois un instant un fichier qu'un antivirus ou un lecteur tient : quelques essais avant d'abandonner.
export const renameWithRetry = async (from: string, to: string): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      if (attempt >= RETRY_TRIES || !RETRY_CODES.has(toCode(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
};

// Le nom que le clip brut prendra dans Traités (créé s'il manque) : le sien s'il est libre, sinon « (2) »… Rien n'y est écrasé.
export const toProcessedName = (directory: string, rawName: string): string => {
  const processed = join(directory, PROCESSED_FOLDER);
  mkdirSync(processed, { recursive: true });
  const taken = toTakenNames(processed);
  return toFreeName(
    rawName,
    (candidate) => taken.has(candidate.toLowerCase()) || taken.has(toChatFileName(candidate).toLowerCase()),
  );
};

// Le clip brut et son chat partent dans Traités sous `name`. Le chat part d'abord : si la vidéo ne peut pas partir, il revient, et le
// clip brut reste complet.
export const moveToProcessedFolder = (directory: string, rawName: string, name: string): void => {
  const processed = join(directory, PROCESSED_FOLDER);
  const chat = { from: join(directory, toChatFileName(rawName)), to: join(processed, toChatFileName(name)) };
  const hasChat = existsSync(chat.from);
  if (hasChat) renameSync(chat.from, chat.to);
  try {
    renameSync(join(directory, rawName), join(processed, name));
  } catch (error) {
    if (hasChat) renameSync(chat.to, chat.from);
    throw error;
  }
};

// Le recodage d'un clip confirmé est fini : son JSON se réécrit, et la nouvelle vidéo prend la place de l'ancienne. Windows refuse
// `rename` par-dessus un fichier que le serveur garde ouvert (`/show` qui le lit) mais accepte de le déplacer : l'ancienne vidéo passe
// dans Traités, la nouvelle entre sous son nom, puis le JSON. Si une étape échoue, l'ancienne vidéo revient.
export const replaceConfirmedVideo = async (
  directory: string,
  plan: ConfirmPlan,
  json: string,
): Promise<void> => {
  const confirmed = join(directory, CONFIRMED_FOLDER);
  const processed = join(directory, PROCESSED_FOLDER);
  mkdirSync(processed, { recursive: true });
  const video = join(confirmed, plan.name);
  const jsonPath = join(confirmed, toConfirmationName(plan.name));
  const nextJson = `${jsonPath}.tmp`;
  const taken = toTakenNames(processed);
  const previous = join(
    processed,
    toFreeName(toPreviousName(plan.name), (candidate) => taken.has(candidate.toLowerCase())),
  );
  writeFileSync(nextJson, json);
  try {
    await renameWithRetry(video, previous);
  } catch (error) {
    rmSync(nextJson, { force: true });
    throw error;
  }
  try {
    await renameWithRetry(plan.outputPath, video);
    await renameWithRetry(nextJson, jsonPath);
  } catch (error) {
    rmSync(nextJson, { force: true });
    rmSync(video, { force: true });
    try {
      await renameWithRetry(previous, video);
    } catch (restoreError) {
      throw new Error(
        `${toMessage(error)} ; l'ancienne vidéo n'a pas pu revenir, elle reste dans ${previous} (${toMessage(restoreError)})`,
      );
    }
    throw error;
  }
};

// Retirer un clip confirmé de l'émission : son JSON (d'abord : le clip sort aussitôt de la liste), sa vidéo et son chat passent dans
// Traités, sous un nom libre pour les trois. Rend le nom de la vidéo là-bas ; si un déplacement échoue, les autres reviennent.
export const withdrawConfirmed = async (directory: string, name: string): Promise<string> => {
  const confirmed = join(directory, CONFIRMED_FOLDER);
  const processed = join(directory, PROCESSED_FOLDER);
  mkdirSync(processed, { recursive: true });
  const taken = toTakenNames(processed);
  const moved = toFreeName(name, (candidate) =>
    [candidate, toConfirmationName(candidate), toChatFileName(candidate)].some((file) =>
      taken.has(file.toLowerCase()),
    ),
  );
  const moves: (readonly [string, string])[] = [
    [toConfirmationName(name), toConfirmationName(moved)],
    [name, moved],
  ];
  if (existsSync(join(confirmed, toChatFileName(name))))
    moves.push([toChatFileName(name), toChatFileName(moved)]);
  const done: (readonly [string, string])[] = [];
  try {
    for (const [from, to] of moves) {
      await renameWithRetry(join(confirmed, from), join(processed, to));
      done.push([from, to]);
    }
  } catch (error) {
    for (const [from, to] of done.reverse()) renameSync(join(processed, to), join(confirmed, from));
    throw error;
  }
  return moved;
};
