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
import type { ExpressionImageBytes } from "../domain/expression.rules";
import { type HeadFile, HeadFileSchema } from "../domain/head.schema";
import type { ExpressionImagePart } from "../domain/head.types";
import { toIssuesMessage } from "../shared/zod-issues";
import type { ExpressionStore, StoredExpression } from "../usecase/expression.usecase";
import { getJsonFile } from "./json-file.gateway";

// Un identifiant d'expression : 8 caractères, jamais un chemin (il vient d'une URL).
export const EXPRESSION_ID = /^[a-z0-9]{8}$/;

const FILES: Record<ExpressionImagePart | "geometry", string> = {
  geometry: "geometry.json",
  source: "source.png",
  top: "top.png",
  bottom: "bottom.png",
};

// Écriture atomique : le fichier temporaire est écrit en entier, puis renommé par-dessus l'ancien.
const writeAtomic = (path: string, content: string | Uint8Array): void => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
};

// Les expressions enregistrées : `data/heads/<id>/` (géométrie, image d'origine, deux moitiés), hors de git. La géométrie
// s'écrit en dernier : tant qu'elle manque, l'expression n'existe pas pour ceux qui listent le dossier.
export function createExpressionStore(directory: string, log: (message: string) => void): ExpressionStore {
  const folderOf = (id: string): string => {
    if (!EXPRESSION_ID.test(id)) throw new Error(`identifiant d'expression invalide : ${id}`);
    return join(directory, id);
  };

  // La version suit l'écriture de la géométrie et des moitiés : l'URL de leurs images change à chaque retouche.
  const toVersion = (folder: string): string => {
    const parts = [FILES.geometry, FILES.top, FILES.bottom].map((name) => statSync(join(folder, name)));
    return `${Math.round(Math.max(...parts.map(({ mtimeMs }) => mtimeMs)))}.${parts.reduce((sum, { size }) => sum + size, 0)}`;
  };

  const read = (id: string): StoredExpression | undefined => {
    if (!EXPRESSION_ID.test(id)) return undefined;
    const folder = folderOf(id);
    if (!existsSync(join(folder, FILES.geometry))) return undefined;
    try {
      const parsed = HeadFileSchema.safeParse(getJsonFile(join(folder, FILES.geometry)));
      if (!parsed.success) {
        log(`Expression ${id} ignorée : geometry.json invalide : ${toIssuesMessage(parsed.error)}`);
        return undefined;
      }
      return { id, name: parsed.data.nom ?? id, version: toVersion(folder), geometry: parsed.data };
    } catch (error) {
      log(`Expression ${id} ignorée : ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const write = (id: string, geometry: HeadFile, images: ExpressionImageBytes): StoredExpression => {
    const folder = folderOf(id);
    mkdirSync(folder, { recursive: true });
    for (const part of ["source", "top", "bottom"] as const) {
      const bytes = images[part];
      if (bytes) writeAtomic(join(folder, FILES[part]), bytes);
    }
    writeAtomic(join(folder, FILES.geometry), `${JSON.stringify(geometry, null, 2)}\n`);
    const stored = read(id);
    if (!stored) throw new Error(`l'expression ${id} n'a pas pu être relue après son écriture`);
    return stored;
  };

  return {
    list() {
      if (!existsSync(directory)) return [];
      // Par nom, puis par identifiant : copier le dossier data/ (un autre PC, un nouveau worktree) ne garde pas les dates de
      // création, l'ordre des vignettes ne peut donc pas en dépendre.
      return readdirSync(directory)
        .filter((id) => EXPRESSION_ID.test(id))
        .flatMap((id) => read(id) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
    },
    get: read,
    getImage(id, part) {
      if (!EXPRESSION_ID.test(id)) return undefined;
      const path = join(folderOf(id), FILES[part]);
      return existsSync(path) ? readFileSync(path) : undefined;
    },
    create: write,
    update: write,
    delete(id) {
      rmSync(folderOf(id), { recursive: true, force: true });
    },
  };
}
