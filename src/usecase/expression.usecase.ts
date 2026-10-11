import { type ExpressionImageBytes, toExpressionIssues } from "../domain/expression.rules";
import {
  type ExpressionDetail,
  type ExpressionIssue,
  type ExpressionSummary,
  PHOTO_ID,
} from "../domain/expression.schema";
import { type HeadFile, toHead } from "../domain/head.schema";
import type { ExpressionImagePart, Head } from "../domain/head.types";

// Une expression enregistrée : son identifiant, son nom, sa version (change à chaque écriture) et sa géométrie.
export type StoredExpression = { id: string; name: string; version: string; geometry: HeadFile };

// Le disque vu du usecase : infra l'implémente (data/heads/<id>/, écritures atomiques). Les écritures peuvent lever.
export type ExpressionStore = {
  list(): StoredExpression[];
  get(id: string): StoredExpression | undefined;
  getImage(id: string, part: ExpressionImagePart): Uint8Array | undefined;
  create(id: string, geometry: HeadFile, images: ExpressionImageBytes): StoredExpression;
  update(id: string, geometry: HeadFile, images: ExpressionImageBytes): StoredExpression;
  delete(id: string): void;
};

export type ExpressionDraft = { name: string; geometry: HeadFile; images: ExpressionImageBytes };

export type ExpressionResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; status: 404 | 422; issues: ExpressionIssue[] };

export type ExpressionLibrary = {
  list(): ExpressionSummary[];
  getDetail(id: string): ExpressionDetail | undefined;
  getImage(id: string, part: ExpressionImagePart): Uint8Array | undefined;
  getHead(id: string): Head | undefined;
  // L'expression à montrer pour l'identifiant choisi (aucun = la photo) ; `found` est faux quand elle n'existe plus.
  getActive(id: string | undefined): { head: Head; found: boolean };
  create(draft: ExpressionDraft): ExpressionResult<ExpressionSummary>;
  update(id: string, draft: ExpressionDraft): ExpressionResult<ExpressionSummary>;
  delete(id: string): ExpressionResult<undefined>;
};

export type ExpressionLibraryDeps = {
  builtIn: { head: Head; geometry: HeadFile; images: { top: Uint8Array; bottom: Uint8Array } };
  store: ExpressionStore;
  createId: () => string;
  onChange: () => void;
};

const PHOTO_NAME = "Photo";

const toSummary = ({ id, name, version }: StoredExpression): ExpressionSummary => ({
  id,
  name,
  version,
  isBuiltIn: false,
});

const refuse = (status: 404 | 422, message: string): ExpressionResult<never> => ({
  ok: false,
  status,
  issues: [{ path: "", message }],
});

// Une panne du disque se dit : rien n'a été écrit, l'expression reste comme elle était.
const toDiskRefusal = (error: unknown): ExpressionResult<never> =>
  refuse(422, `rien n'est enregistré : ${error instanceof Error ? error.message : String(error)}`);

export function createExpressionLibrary({
  builtIn,
  store,
  createId,
  onChange,
}: ExpressionLibraryDeps): ExpressionLibrary {
  const photo: ExpressionSummary = {
    id: PHOTO_ID,
    name: PHOTO_NAME,
    version: builtIn.head.expression.version,
    isBuiltIn: true,
  };

  // Le fichier de géométrie d'une expression enregistrée : format 2, avec son nom.
  const toFile = ({ name, geometry }: ExpressionDraft): HeadFile => ({
    ...geometry,
    format: "tete-south-park/2",
    nom: name,
  });

  const save = (write: () => StoredExpression): ExpressionResult<ExpressionSummary> => {
    try {
      const stored = write();
      onChange();
      return { ok: true, value: toSummary(stored) };
    } catch (error) {
      return toDiskRefusal(error);
    }
  };

  const getHead = (id: string): Head | undefined => {
    if (id === PHOTO_ID) return builtIn.head;
    const stored = store.get(id);
    return stored && toHead(stored.geometry, { id, version: stored.version });
  };

  return {
    list: () => [photo, ...store.list().map(toSummary)],
    getDetail(id) {
      if (id === PHOTO_ID) return { ...photo, geometry: builtIn.geometry };
      const stored = store.get(id);
      return stored && { ...toSummary(stored), geometry: stored.geometry };
    },
    getImage(id, part) {
      if (id === PHOTO_ID) return part === "source" ? undefined : builtIn.images[part];
      return store.getImage(id, part);
    },
    getHead,
    getActive(id) {
      const wanted = id === undefined ? builtIn.head : getHead(id);
      return wanted ? { head: wanted, found: true } : { head: builtIn.head, found: false };
    },
    create(draft) {
      const issues = toExpressionIssues(draft.geometry, draft.images);
      if (!draft.images.source) issues.push({ path: "source", message: "l'image d'origine manque" });
      if (issues.length > 0) return { ok: false, status: 422, issues };
      return save(() => store.create(createId(), toFile(draft), draft.images));
    },
    update(id, draft) {
      if (id === PHOTO_ID) return refuse(422, "la photo ne se change pas : enregistre-la sous un autre nom");
      if (!store.get(id)) return refuse(404, "expression introuvable");
      const issues = toExpressionIssues(draft.geometry, draft.images);
      if (issues.length > 0) return { ok: false, status: 422, issues };
      return save(() => store.update(id, toFile(draft), draft.images));
    },
    delete(id) {
      if (id === PHOTO_ID) return refuse(422, "la photo ne se supprime pas");
      if (!store.get(id)) return refuse(404, "expression introuvable");
      try {
        store.delete(id);
      } catch (error) {
        return toDiskRefusal(error);
      }
      onChange();
      return { ok: true, value: undefined };
    },
  };
}
