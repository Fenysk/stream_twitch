import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AUDIO_FORMATS, type AudioFormat, type SoundFile, SoundFileSchema } from "../domain/sound.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import type { SoundStore, StoredSound } from "../usecase/sound.usecase";
import { getJsonFile } from "./json-file.gateway";

// Un identifiant de son : 8 caractères, jamais un chemin (il vient d'une URL).
export const SOUND_ID = /^[a-z0-9]{8}$/;

const SOUND_JSON = "sound.json";
const audioFileOf = (format: AudioFormat): string => `audio.${format}`;

// Écriture atomique : le fichier temporaire est écrit en entier, puis renommé par-dessus l'ancien.
const writeAtomic = (path: string, content: string | Uint8Array): void => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
};

// Les sons enregistrés : `data/sounds/<id>/` (sound.json et audio.mp3|wav|ogg), hors de git. sound.json s'écrit en dernier :
// tant qu'il manque, le son n'existe pas pour ceux qui listent le dossier.
export function createSoundStore(directory: string, log: (message: string) => void): SoundStore {
  const folderOf = (id: string): string => {
    if (!SOUND_ID.test(id)) throw new Error(`identifiant de son invalide : ${id}`);
    return join(directory, id);
  };

  // La version suit l'écriture de sound.json et du fichier audio : l'adresse du fichier change à chaque modification.
  const toVersion = (folder: string, format: AudioFormat): string => {
    const parts = [SOUND_JSON, audioFileOf(format)]
      .filter((name) => existsSync(join(folder, name)))
      .map((name) => statSync(join(folder, name)));
    return `${Math.round(Math.max(...parts.map(({ mtimeMs }) => mtimeMs)))}.${parts.reduce((sum, { size }) => sum + size, 0)}`;
  };

  // Les réglages d'un son dont sound.json est valide ; sinon rien, et le journal dit pourquoi. Un son dont le fichier audio
  // manque reste : son reward existe chez Twitch, ses rachats doivent être rendus ; `getFile` ne rend rien pour lui.
  const getSound = (id: string, folder: string): SoundFile | undefined => {
    const parsed = SoundFileSchema.safeParse(getJsonFile(join(folder, SOUND_JSON)));
    if (parsed.success) return parsed.data;
    log(`Son ${id} ignoré : sound.json invalide : ${toIssuesMessage(parsed.error)}`);
    return undefined;
  };

  const read = (id: string): StoredSound | undefined => {
    if (!SOUND_ID.test(id)) return undefined;
    const folder = folderOf(id);
    if (!existsSync(join(folder, SOUND_JSON))) return undefined;
    try {
      const sound = getSound(id, folder);
      return sound && { id, ...sound, version: toVersion(folder, sound.format) };
    } catch (error) {
      log(`Son ${id} ignoré : ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const write = (id: string, sound: SoundFile, file: Uint8Array | undefined): StoredSound => {
    const folder = folderOf(id);
    mkdirSync(folder, { recursive: true });
    if (file) writeAtomic(join(folder, audioFileOf(sound.format)), file);
    writeAtomic(join(folder, SOUND_JSON), `${JSON.stringify(sound, null, 2)}\n`);
    // Un fichier d'un autre format n'est plus celui du son : il part une fois sound.json à jour.
    for (const format of AUDIO_FORMATS) {
      if (format !== sound.format) rmSync(join(folder, audioFileOf(format)), { force: true });
    }
    const stored = read(id);
    if (!stored) throw new Error(`le son ${id} n'a pas pu être relu après son écriture`);
    return stored;
  };

  return {
    list() {
      if (!existsSync(directory)) return [];
      return readdirSync(directory)
        .filter((id) => SOUND_ID.test(id))
        .flatMap((id) => read(id) ?? []);
    },
    get: read,
    getFile(id) {
      const stored = read(id);
      const path = stored && join(folderOf(id), audioFileOf(stored.format));
      return path && existsSync(path) ? readFileSync(path) : undefined;
    },
    create: write,
    update: write,
    delete(id) {
      rmSync(folderOf(id), { recursive: true, force: true });
    },
  };
}
