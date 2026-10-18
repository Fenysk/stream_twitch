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
import { type LegacySound, toUpgradedRecords } from "../domain/reward.rules";
import { hasLegacyFields } from "../domain/sound.rules";
import {
  AUDIO_FORMATS,
  type AudioFormat,
  LegacySoundFileSchema,
  type SoundFile,
  SoundFileSchema,
} from "../domain/sound.schema";
import { toIssuesMessage } from "../shared/zod-issues";
import type { RewardRecordStore } from "../usecase/reward.usecase";
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

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
  // manque reste, pour qu'on puisse le supprimer ; `getFile` ne rend rien pour lui.
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
      log(`Son ${id} ignoré : ${toMessage(error)}`);
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

// Les sound.json d'avant : leur dossier et ce que sound.json y dit, lu une fois. Un sound.json illisible est sauté, le journal le dit.
const listLegacy = (directory: string, log: (message: string) => void): LegacySound[] =>
  readdirSync(directory)
    .filter((id) => SOUND_ID.test(id) && existsSync(join(directory, id, SOUND_JSON)))
    .flatMap((id) => {
      try {
        const parsed = LegacySoundFileSchema.safeParse(getJsonFile(join(directory, id, SOUND_JSON)));
        return parsed.success && hasLegacyFields(parsed.data) ? [{ id, file: parsed.data }] : [];
      } catch (error) {
        log(`Son ${id} : conversion sautée : ${toMessage(error)}`);
        return [];
      }
    });

// Au démarrage : le reward d'un sound.json d'avant (rewardId, isManaged) entre dans data/rewards.json, puis sound.json ne garde que
// son titre, son fader et son format. rewards.json d'abord, sound.json ensuite : un arrêt entre les deux se rejoue sans rien perdre.
// En cas de panne, aucun sound.json n'est réécrit : le prochain démarrage recommence.
export function upgradeSounds(
  directory: string,
  rewards: RewardRecordStore,
  log: (message: string) => void,
): void {
  if (!existsSync(directory)) return;
  const legacy = listLegacy(directory, log);
  if (legacy.length === 0) return;
  try {
    const before = rewards.get();
    const after = toUpgradedRecords(before, legacy);
    if (after !== before) rewards.update(after);
    for (const { id, file } of legacy) {
      const { title, fader, format } = file;
      writeAtomic(join(directory, id, SOUND_JSON), `${JSON.stringify({ title, fader, format }, null, 2)}\n`);
    }
    const linked = Object.keys(after).length - Object.keys(before).length;
    log(
      `Sons : ${legacy.length} sound.json converti(s) (titre, fader, format) ; ${linked} récompense(s) reliée(s) dans data/rewards.json.`,
    );
  } catch (error) {
    log(
      `Sons : conversion des sound.json impossible, elle sera refaite au prochain démarrage : ${toMessage(error)}`,
    );
  }
}
