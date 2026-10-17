// L'en-tête `Range` d'une requête de lecture vidéo : sans lui, un lecteur ne peut pas se déplacer dans un fichier de 250 Mo.
export type ByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

// Un seul intervalle d'octets, bornes comprises (« bytes=0-99 », « bytes=250- », « bytes=-100 »). Tout ce qu'on ne comprend pas
// (plusieurs intervalles, une autre unité) est ignoré, comme le permet HTTP : le fichier entier part.
export const toByteRange = (header: string | null, size: number): ByteRange => {
  const match = header === null ? null : SINGLE_RANGE.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return { kind: "full" };
  const [, first = "", last = ""] = match;
  if (size === 0) return { kind: "unsatisfiable" };
  if (first === "") {
    // « -100 » : les 100 derniers octets.
    const length = Number(last);
    return length === 0
      ? { kind: "unsatisfiable" }
      : { kind: "partial", start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  return start >= size || end < start ? { kind: "unsatisfiable" } : { kind: "partial", start, end };
};
