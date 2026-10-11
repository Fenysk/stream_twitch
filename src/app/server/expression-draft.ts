import type { ExpressionImageBytes } from "../../domain/expression.rules";
import { type ExpressionInput, ExpressionInputSchema } from "../../domain/expression.schema";
import { fromBase64 } from "../../shared/base64";
import { toIssuesMessage } from "../../shared/zod-issues";
import type { ExpressionDraft } from "../../usecase/expression.usecase";
import { getBodyJson, isJson, refuse } from "./http";

// Un enregistrement porte trois images en base64 : au-delà, la demande est refusée avant d'être lue.
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// Une image illisible (pas du base64) reste vide : le serveur la refuse comme « pas une image PNG ».
const NOT_AN_IMAGE = new Uint8Array(0);

// Le corps reçu devient ce que la bibliothèque d'expressions attend : les images en octets.
const toExpressionDraft = ({ name, geometry, source, top, bottom }: ExpressionInput): ExpressionDraft => {
  const images: ExpressionImageBytes = {
    top: fromBase64(top) ?? NOT_AN_IMAGE,
    bottom: fromBase64(bottom) ?? NOT_AN_IMAGE,
    ...(source === undefined ? {} : { source: fromBase64(source) ?? NOT_AN_IMAGE }),
  };
  return { name, geometry, images };
};

// Lit la demande de création ou de mise à jour : l'expression à enregistrer, ou la réponse qui la refuse.
export async function getExpressionDraft(request: Request): Promise<ExpressionDraft | Response> {
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return refuse(413, "demande trop lourde");
  const parsed = ExpressionInputSchema.safeParse(await getBodyJson(request));
  return parsed.success ? toExpressionDraft(parsed.data) : refuse(400, toIssuesMessage(parsed.error));
}
