import type { Voice } from "./voice.schema";

// Un message du tchat tient dans 500 caractères.
export const MAX_SPEECH_LENGTH = 500;

// `fr` seul ou `fr-XX` : « fro-XX » n'est pas du français.
export function toFrenchVoices(voices: readonly Voice[]): Voice[] {
  return voices.filter(({ language }) => /^fr(-|$)/i.test(language));
}

// Le texte à dire : retours à la ligne et caractères de contrôle ramenés à une espace, blancs répétés réduits, coupé à
// MAX_SPEECH_LENGTH caractères (par points de code : un emoji n'est jamais fendu). Vide : rien à dire.
export function toSpeechText(raw: string): string | null {
  const text = raw
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  return Array.from(text).slice(0, MAX_SPEECH_LENGTH).join("").trim();
}

// Un fichier WAV commence par « RIFF », sa taille, puis « WAVE » ; il n'a rien à dire sans plus que son en-tête (44 octets).
const WAV_HEADER_SIZE = 44;
const startsWith = (bytes: Uint8Array, offset: number, text: string): boolean =>
  Array.from(text).every((character, index) => bytes[offset + index] === character.charCodeAt(0));

export function isWav(bytes: Uint8Array): boolean {
  return bytes.length > WAV_HEADER_SIZE && startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WAVE");
}

const toChunkId = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...Array.from(bytes.subarray(offset, offset + 4)));

// La durée d'un WAV en ms, lue dans son en-tête : l'octet par seconde du bloc « fmt », et la taille du bloc « data »
// (bornée à ce qui est vraiment là : un WAV produit en flux peut déclarer une taille fausse). Rien si ce n'est pas un WAV.
export function toWavDuration(bytes: Uint8Array): number | undefined {
  if (!isWav(bytes)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = toChunkId(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt " && start + 12 <= bytes.length) byteRate = view.getUint32(start + 8, true);
    if (id === "data") {
      const audioSize = Math.min(size, bytes.length - start);
      return byteRate ? Math.round((audioSize / byteRate) * 1000) : undefined;
    }
    offset = start + size + (size % 2);
  }
  return undefined;
}
