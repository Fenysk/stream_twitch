import { type AudioFormat, type LegacySoundFile, SOUND_LIMITS } from "./sound.schema";
import { isWav } from "./voice.rules";

const hasText = (bytes: Uint8Array, text: string): boolean =>
  Array.from(text).every((character, index) => bytes[index] === character.charCodeAt(0));

// Un mp3 commence par un en-tête « ID3 », ou directement par une trame : 11 bits à 1, puis une version et une couche qui
// ne sont pas « réservées » (ce qui écarte l'AAC, dont la couche vaut 0).
const isMp3 = (bytes: Uint8Array): boolean => {
  if (hasText(bytes, "ID3")) return true;
  const second = bytes[1] ?? 0;
  return (
    bytes[0] === 0xff && (second & 0xe0) === 0xe0 && ((second >> 3) & 3) !== 1 && ((second >> 1) & 3) !== 0
  );
};

// Le format d'un fichier audio, lu dans ses premiers octets ; rien si ce n'est ni un mp3, ni un wav, ni un ogg.
export function toAudioFormat(bytes: Uint8Array): AudioFormat | undefined {
  if (isWav(bytes)) return "wav";
  if (hasText(bytes, "OggS")) return "ogg";
  return isMp3(bytes) ? "mp3" : undefined;
}

export const AUDIO_MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

const MEGABYTE = 1024 * 1024;

export type AudioFile = { ok: true; format: AudioFormat } | { ok: false; message: string };

// Un fichier importé est accepté s'il tient dans 5 Mo et s'il est un mp3, un wav ou un ogg.
export function toAudioFile(bytes: Uint8Array): AudioFile {
  if (bytes.length > SOUND_LIMITS.fileMaxBytes) {
    const size = (bytes.length / MEGABYTE).toFixed(1).replace(".", ",");
    return {
      ok: false,
      message: `le fichier pèse ${size} Mo : ${SOUND_LIMITS.fileMaxBytes / MEGABYTE} Mo au plus`,
    };
  }
  const format = toAudioFormat(bytes);
  return format
    ? { ok: true, format }
    : { ok: false, message: "ce fichier n'est pas un mp3, un wav ou un ogg" };
}

const toTitleKey = (title: string): string => title.trim().toLocaleLowerCase("fr");

// Deux sounds ne portent pas le même titre, majuscules et blancs de bord comptés pour rien.
export const isTitleTaken = (title: string, others: readonly string[]): boolean =>
  others.some((other) => toTitleKey(other) === toTitleKey(title));

// Un sound.json d'avant porte encore le coût, la pace, le reward ou `isManaged` : ils ont quitté le sound.
export const hasLegacyFields = ({ cost, pace, rewardId, isManaged }: LegacySoundFile): boolean =>
  [cost, pace, rewardId, isManaged].some((field) => field !== undefined);

// Combien de clips confirmés ont au moins un rire de chaque sound : un clip qui répète un rire ne compte qu'une fois.
export function toClipCounts(
  clips: readonly { laughs?: readonly { sound: string }[] | undefined }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const clip of clips) {
    for (const sound of new Set((clip.laughs ?? []).map((laugh) => laugh.sound))) {
      counts.set(sound, (counts.get(sound) ?? 0) + 1);
    }
  }
  return counts;
}
