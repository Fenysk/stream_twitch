import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHOTO_ID } from "../domain/expression.schema";
import { type HeadFile, HeadFileSchema, toHead } from "../domain/head.schema";
import type { Head, HeadPart } from "../domain/head.types";
import { toIssuesMessage } from "../shared/zod-issues";
import { getJsonFile } from "./json-file.gateway";

export type HeadImages = Record<HeadPart, Uint8Array<ArrayBuffer>>;

const IMAGE_NAMES: Record<HeadPart, string> = { top: "tete-haut.png", bottom: "tete-bas.png" };

// La photo intégrée, lue une seule fois au démarrage. `version` change à chaque démarrage : l'URL de ses images change,
// OBS ne garde pas l'ancienne en cache après un changement des fichiers.
export function getHeadFiles(
  directory: string,
  version: string,
): { head: Head; geometry: HeadFile; images: HeadImages } {
  const parsed = HeadFileSchema.safeParse(getJsonFile(join(directory, "tete.json")));
  if (!parsed.success) throw new Error(`tete.json invalide : ${toIssuesMessage(parsed.error)}`);
  return {
    head: toHead(parsed.data, { id: PHOTO_ID, version }),
    geometry: parsed.data,
    images: {
      top: readFileSync(join(directory, IMAGE_NAMES.top)),
      bottom: readFileSync(join(directory, IMAGE_NAMES.bottom)),
    },
  };
}
