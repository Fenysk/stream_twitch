import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HeadFileSchema, toHead } from "../domain/head.schema";
import type { Head, HeadPart } from "../domain/head.types";
import { toIssuesMessage } from "../shared/zod-issues";
import { getJsonFile } from "./json-file.gateway";

export type HeadImages = Record<HeadPart, Uint8Array<ArrayBuffer>>;

const IMAGE_NAMES: Record<HeadPart, string> = { top: "tete-haut.png", bottom: "tete-bas.png" };

// Lu une seule fois au démarrage : pour changer la tête, remplacer les fichiers puis relancer le serveur.
export function getHeadFiles(directory: string): { head: Head; images: HeadImages } {
  const parsed = HeadFileSchema.safeParse(getJsonFile(join(directory, "tete.json")));
  if (!parsed.success) throw new Error(`tete.json invalide : ${toIssuesMessage(parsed.error)}`);
  return {
    head: toHead(parsed.data),
    images: {
      top: readFileSync(join(directory, IMAGE_NAMES.top)),
      bottom: readFileSync(join(directory, IMAGE_NAMES.bottom)),
    },
  };
}
