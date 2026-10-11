// Le base64 des images qui vont et viennent entre l'interface et le serveur (JSON). `atob`/`btoa` existent des deux côtés.
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(text);
}

// Rien pour un texte qui n'est pas du base64 : l'appelant le refuse comme n'importe quelle image illisible.
export function fromBase64(text: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}
