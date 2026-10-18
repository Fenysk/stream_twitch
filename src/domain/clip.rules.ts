import {
  CLIP_EXTENSIONS,
  type ClipConfirmation,
  type ClipLaugh,
  type ConfirmedSummary,
  type ConfirmRequest,
} from "./clip.schema";
import { isLaughFader, isRecord } from "./laugh.rules";
import { LAUGH_PHRASE } from "./show.rules";
import { STEP_SECONDS } from "./trim.rules";

const EXTENSION = /\.[^./\\]+$/;
// Un séparateur de chemin, un lecteur ou un flux de données Windows (« : »).
const PATH_PART = /[\\/:]/;
const NAME_MAX_LENGTH = 255;

const MIMES: Record<(typeof CLIP_EXTENSIONS)[number], string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
};

const hasControlCharacter = (name: string): boolean =>
  Array.from(name).some((character) => character.charCodeAt(0) < 32);

const toExtension = (name: string): (typeof CLIP_EXTENSIONS)[number] | undefined => {
  const found = EXTENSION.exec(name)?.[0].toLowerCase();
  return CLIP_EXTENSIONS.find((extension) => extension === found);
};

// Le client désigne un clip par son nom : seul un nom de fichier vidéo seul passe, jamais un chemin ni une remontée (« .. »).
export const isClipName = (name: string): boolean =>
  name.length > 0 &&
  name.length <= NAME_MAX_LENGTH &&
  !PATH_PART.test(name) &&
  !hasControlCharacter(name) &&
  !name.includes("..") &&
  toExtension(name) !== undefined;

export const toClipStem = (name: string): string => name.replace(EXTENSION, "");

// Le clip confirmé est toujours un .mp4 ; son JSON et son chat gardent son nom (sans l'extension) : les trois restent ensemble.
export const toConfirmedName = (rawName: string): string => `${toClipStem(rawName)}.mp4`;
export const toConfirmationName = (name: string): string => `${toClipStem(name)}.json`;
export const toChatFileName = (name: string): string => `${toClipStem(name)}.chat.json`;

const FREE_NAME_TRIES = 999;

// Le premier nom libre : `name`, puis `nom (2).ext`, `nom (3).ext`… Rien n'est jamais écrasé dans Confirmés ni dans Traités.
export const toFreeName = (name: string, isTaken: (candidate: string) => boolean): string => {
  if (!isTaken(name)) return name;
  const stem = toClipStem(name);
  const extension = name.slice(stem.length);
  for (let number = 2; number <= FREE_NAME_TRIES; number += 1) {
    const candidate = `${stem} (${number})${extension}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`aucun nom libre pour « ${name} »`);
};

// La vidéo confirmée qu'un nouveau recodage remplace garde son contenu : elle passe dans Traités sous ce nom (rien n'est effacé).
export const toPreviousName = (name: string): string => {
  const stem = toClipStem(name);
  return `${stem} (ancienne version)${name.slice(stem.length)}`;
};

// Un début et une fin sont les mêmes à un millième de seconde près (une image dure 17 ms) : le recodage n'est pas à refaire.
const SAME_TRIM_SECONDS = 0.001;

export const isSameTrim = (
  first: { start: number; end: number },
  second: { start: number; end: number },
): boolean =>
  Math.abs(first.start - second.start) < SAME_TRIM_SECONDS &&
  Math.abs(first.end - second.end) < SAME_TRIM_SECONDS;

export const toClipMime = (name: string): string => {
  const extension = toExtension(name);
  return extension ? MIMES[extension] : "application/octet-stream";
};

export const TITLE_MAX_LENGTH = 120;
export const PHRASE_MAX_LENGTH = 500;
// Le lecteur du navigateur et ffprobe n'arrondissent pas la durée pareil : une fin qui la dépasse de si peu la désigne.
const END_TOLERANCE_SECONDS = 0.1;

// Le JSON d'un clip confirmé tel qu'il est écrit : tout ce que la liste en sait, sans le nom de sa vidéo ni sa version (qui ne sont pas
// dans le JSON), et `processedName` seulement quand le clip brut est encore dans Traités.
export const toStoredConfirmation = (clip: ConfirmedSummary): ClipConfirmation => {
  const { name, version, processedName, ...kept } = clip;
  return { ...kept, ...(processedName === null ? {} : { processedName }) };
};

// Le JSON d'un clip confirmé d'avant la phrase de fin : sans la clé `endPhrase` et avec des rires, il se lit avec la phrase que Jean-Renard
// disait alors après les rires (`LAUGH_PHRASE`). Un JSON qui a la clé, même vide, garde le choix d'Alexis ; sans rire, rien n'est ajouté.
export const toEndPhraseJson = (json: unknown): unknown => {
  if (!isRecord(json) || "endPhrase" in json) return json;
  const { laughs } = json;
  return Array.isArray(laughs) && laughs.length > 0 ? { ...json, endPhrase: LAUGH_PHRASE } : json;
};

export const LAUGH_MAX_LENGTH = 64;
export const LAUGHS_MAX_COUNT = 50;

// `endPhrase` est toujours écrite, même vide : un JSON qui l'a ne reçoit plus la phrase des rires d'avant (`toEndPhraseJson`).
export type ConfirmChoice = Pick<
  ClipConfirmation,
  "title" | "phrase" | "start" | "end" | "laughs" | "laughFader"
> & {
  endPhrase: string;
};
export type ConfirmCheck = { ok: true; value: ConfirmChoice } | { ok: false; message: string };

const toSeconds = (seconds: number): string => `${Number(seconds.toFixed(2))} s`;

// Les rires posés : 50 au plus, chacun un sound (identifiant de 1 à 64 caractères) à un instant fini et positif ou nul. Aucune borne
// haute sur l'instant : un rire hors de la partie gardée reste dans le JSON, une recoupe peut le ramener dedans.
const toLaughsRefusal = (laughs: readonly ClipLaugh[]): string | false =>
  (laughs.length > LAUGHS_MAX_COUNT && `un clip ne peut pas avoir plus de ${LAUGHS_MAX_COUNT} rires`) ||
  (laughs.some(({ sound }) => sound.length < 1 || sound.length > LAUGH_MAX_LENGTH) &&
    `un rire doit désigner un sound (1 à ${LAUGH_MAX_LENGTH} caractères)`) ||
  (laughs.some(({ at }) => !Number.isFinite(at) || at < 0) &&
    "l'instant d'un rire doit être un nombre positif ou nul");

// Les phrases de début et de fin : 500 caractères au plus chacune.
const toPhrasesRefusal = (phrase: string, endPhrase: string): string | false =>
  (phrase.length > PHRASE_MAX_LENGTH &&
    `la phrase de début ne peut pas dépasser ${PHRASE_MAX_LENGTH} caractères`) ||
  (endPhrase.length > PHRASE_MAX_LENGTH &&
    `la phrase de fin ne peut pas dépasser ${PHRASE_MAX_LENGTH} caractères`);

// Ce qu'Alexis valide : un titre (obligatoire), une phrase de début et une phrase de fin (facultatives : vides, Jean-Renard se tait), la
// partie gardée du clip, de `start` à `end`, d'une image au moins, dans la durée du clip, les rires posés (facultatifs), triés par
// instant, et leur volume (facultatif).
export const toConfirmChoice = (request: ConfirmRequest, duration: number): ConfirmCheck => {
  const title = request.title.trim();
  const phrase = request.phrase.trim();
  const endPhrase = request.endPhrase.trim();
  const laughs = (request.laughs ?? [])
    .map(({ at, sound }) => ({ at, sound: sound.trim() }))
    .sort((first, second) => first.at - second.at);
  const { start, end } = request;
  const refusal =
    (title === "" && "le titre est obligatoire") ||
    (title.length > TITLE_MAX_LENGTH && `le titre ne peut pas dépasser ${TITLE_MAX_LENGTH} caractères`) ||
    toPhrasesRefusal(phrase, endPhrase) ||
    toLaughsRefusal(laughs) ||
    (request.laughFader !== undefined &&
      !isLaughFader(request.laughFader) &&
      "le volume des rires doit être un nombre entier de 0 à 100") ||
    (start < 0 && "le début ne peut pas être négatif") ||
    (end - start < STEP_SECONDS - 1e-9 && "le début doit précéder la fin d'au moins une image") ||
    (end > duration + END_TOLERANCE_SECONDS &&
      `la fin (${toSeconds(end)}) dépasse la durée du clip (${toSeconds(duration)})`);
  if (refusal) return { ok: false, message: refusal };
  return {
    ok: true,
    value: {
      title,
      phrase,
      endPhrase,
      start,
      end: Math.min(end, duration),
      ...(laughs.length === 0 ? {} : { laughs }),
      ...(request.laughFader === undefined ? {} : { laughFader: request.laughFader }),
    },
  };
};

export type ClipFile = { name: string; modifiedAt: number; size: number };

// Les clips d'un dossier : les fichiers vidéo seulement, du plus récent au plus ancien (à date égale, le nom le plus grand d'abord).
export const toRawClips = <File extends ClipFile>(files: readonly File[]): File[] =>
  files
    .filter(({ name }) => isClipName(name))
    .sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
