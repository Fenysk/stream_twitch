export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2000;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];
const SIZE_END = 24;

const startsWith = (bytes: Uint8Array, expected: number[], offset: number): boolean =>
  expected.every((value, index) => bytes[offset + index] === value);

// Les dimensions d'un PNG, lues dans son en-tête, sans décoder l'image. Rien si ce n'est pas un PNG.
export function toPngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < SIZE_END || !startsWith(bytes, SIGNATURE, 0) || !startsWith(bytes, IHDR, 12)) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}
