// Le fichier audio choisi dans le formulaire : lu en entier, vérifié comme le serveur le fera (5 Mo, mp3, wav ou ogg) pour
// refuser tout de suite, puis passé en base64 pour la demande.

import { toAudioFile } from "../../domain/sound.rules";
import { toBase64 } from "../../shared/base64";

export type SoundFileAnswer = { ok: true; base64: string } | { ok: false; message: string };

export const getSoundFile = async (file: File): Promise<SoundFileAnswer> => {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, message: "ce fichier ne peut pas être lu" };
  }
  const audio = toAudioFile(bytes);
  return audio.ok ? { ok: true, base64: toBase64(bytes) } : { ok: false, message: audio.message };
};
