// L'état de l'onglet « Découpe » : l'image en cours de découpe (un brouillon), ce qu'on en fait (importer, rouvrir une
// expression, l'enregistrer, la supprimer) et ce que le serveur en dit. Rien ne part tant qu'on n'enregistre pas.

import { useCallback, useEffect, useState } from "react";
import {
  type ImageSize,
  type Lips,
  toCutSuggestion,
  toEditableCut,
  toExpressionGeometry,
} from "../../domain/cut.rules";
import { type ExpressionInput, PHOTO_ID } from "../../domain/expression.schema";
import type { HeadFile } from "../../domain/head.schema";
import type { Cut } from "../../domain/head.types";
import { toBase64 } from "../../shared/base64";
import { toImageUrl } from "../expression-urls";
import {
  createExpression,
  deleteExpression,
  getExpressionDetail,
  updateExpression,
} from "../expressions-api";
import { toPartCanvases } from "./build-parts";
import { toPngBlob } from "./canvas";
import { getImportedImage } from "./import-image";

// Une image en cours de découpe. `expressionId` : l'expression retouchée (aucune pour une image qu'on vient d'importer).
// `sourceBlob` : l'image à envoyer à la création ; une expression rouverte garde celle du serveur.
export type Draft = {
  expressionId: string | null;
  name: string;
  size: ImageSize;
  sourceUrl: string;
  sourceBlob: Blob | null;
  cut: Cut;
  lips: Lips;
  closing: number;
  animation: HeadFile["animation"];
  isGapFound: boolean;
};

type Adjustment = Partial<Pick<Draft, "name" | "cut" | "lips" | "closing">>;

export type CutEditor = {
  draft: Draft | null;
  // L'image du brouillon, décodée : la source des deux moitiés.
  image: HTMLImageElement | null;
  refusal: string | null;
  notice: string | null;
  isBusy: boolean;
  openFile: (file: File) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  adjust: (adjustment: Adjustment) => void;
  submit: () => Promise<void>;
  deleteCurrent: () => Promise<void>;
  startOver: () => void;
};

// Un nom de fichier devient le nom proposé : sans extension, sans tirets ni soulignés, 40 caractères au plus.
const toProposedName = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 40);

const toBlobBase64 = async (blob: Blob): Promise<string> =>
  toBase64(new Uint8Array(await blob.arrayBuffer()));

const toInput = async (draft: Draft, image: HTMLImageElement): Promise<ExpressionInput> => {
  const parts = toPartCanvases(image, draft.size, draft.cut, draft.lips);
  const [top, bottom] = await Promise.all([toPngBlob(parts.top), toPngBlob(parts.bottom)]);
  return {
    name: draft.name.trim(),
    geometry: toExpressionGeometry(draft),
    top: await toBlobBase64(top),
    bottom: await toBlobBase64(bottom),
    ...(draft.sourceBlob ? { source: await toBlobBase64(draft.sourceBlob) } : {}),
  };
};

export const useCutEditor = (onListChange: () => void): CutEditor => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const sourceUrl = draft?.sourceUrl;

  // L'image du brouillon se charge une fois ; une image importée garde son adresse en mémoire jusqu'à ce qu'elle change.
  useEffect(() => {
    if (!sourceUrl) {
      setImage(null);
      return;
    }
    let isCurrent = true;
    const element = new Image();
    element.onload = () => {
      if (isCurrent) setImage(element);
    };
    element.onerror = () => {
      if (isCurrent) setRefusal("image illisible");
    };
    element.src = sourceUrl;
    return () => {
      isCurrent = false;
      if (sourceUrl.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  const openFile = useCallback(async (file: File) => {
    setRefusal(null);
    setNotice(null);
    setIsBusy(true);
    const [imported, photo] = await Promise.all([getImportedImage(file), getExpressionDetail(PHOTO_ID)]);
    setIsBusy(false);
    if (!imported.ok) return setRefusal(imported.message);
    if (!photo.ok) return setRefusal(`la photo n'a pas pu être lue : ${photo.message}`);
    const { blob, size, alpha } = imported.image;
    const suggestion = toCutSuggestion(alpha);
    setImage(null);
    setDraft({
      expressionId: null,
      name: toProposedName(file.name),
      size,
      sourceUrl: URL.createObjectURL(blob),
      sourceBlob: blob,
      cut: suggestion.cut,
      lips: suggestion.lips,
      closing: suggestion.closing,
      animation: photo.value.geometry.animation,
      isGapFound: suggestion.isGapFound,
    });
  }, []);

  const reopen = useCallback(async (id: string) => {
    setRefusal(null);
    setNotice(null);
    setIsBusy(true);
    const detail = await getExpressionDetail(id);
    setIsBusy(false);
    if (!detail.ok) return setRefusal(detail.message);
    const { geometry, version } = detail.value;
    setImage(null);
    setDraft({
      ...toEditableCut(geometry),
      expressionId: id,
      size: { width: geometry.image.largeur, height: geometry.image.hauteur },
      sourceUrl: toImageUrl({ id, version }, "source"),
      sourceBlob: null,
      animation: geometry.animation,
      isGapFound: false,
    });
  }, []);

  const adjust = useCallback((adjustment: Adjustment) => {
    setNotice(null);
    setDraft((current) => (current ? { ...current, ...adjustment } : current));
  }, []);

  const submit = useCallback(async () => {
    if (!draft || !image) return;
    setRefusal(null);
    setNotice(null);
    setIsBusy(true);
    try {
      const input = await toInput(draft, image);
      const answer = draft.expressionId
        ? await updateExpression(draft.expressionId, input)
        : await createExpression(input);
      if (!answer.ok) return setRefusal(answer.message);
      // Une image qui vient d'être enregistrée est celle du serveur : une retouche ne la renvoie pas.
      setDraft((current) =>
        current ? { ...current, expressionId: answer.value.id, sourceBlob: null } : current,
      );
      setNotice("Enregistrée.");
      onListChange();
    } catch (error) {
      console.error("Découpe : enregistrement impossible", error);
      setRefusal("les images n'ont pas pu être préparées");
    } finally {
      setIsBusy(false);
    }
  }, [draft, image, onListChange]);

  const deleteCurrent = useCallback(async () => {
    const id = draft?.expressionId;
    if (!id) return;
    setRefusal(null);
    setIsBusy(true);
    const answer = await deleteExpression(id);
    setIsBusy(false);
    if (!answer.ok) return setRefusal(answer.message);
    setDraft(null);
    setNotice("Supprimée.");
    onListChange();
  }, [draft?.expressionId, onListChange]);

  const startOver = useCallback(() => {
    setDraft(null);
    setRefusal(null);
    setNotice(null);
  }, []);

  return {
    draft,
    image,
    refusal,
    notice,
    isBusy,
    openFile,
    reopen,
    adjust,
    submit,
    deleteCurrent,
    startOver,
  };
};
