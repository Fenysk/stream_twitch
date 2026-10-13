// Les expressions côté page : ce que l'interface demande au serveur. Chaque demande rend une réponse ou le refus à montrer,
// jamais une exception. Les refus du serveur sont déjà en français, on les affiche tels quels.

import {
  type ExpressionDetail,
  ExpressionDetailSchema,
  type ExpressionInput,
  ExpressionListSchema,
  ExpressionRefusalSchema,
  type ExpressionSummary,
  ExpressionSummarySchema,
} from "../domain/expression.schema";

export type Answer<Value> = { ok: true; value: Value } | { ok: false; message: string };

const toRefusal = async (response: Response): Promise<string> => {
  try {
    const refusal = ExpressionRefusalSchema.safeParse(await response.json());
    if (refusal.success) {
      return refusal.data.issues
        .map(({ path, message }) => (path ? `${path} : ${message}` : message))
        .join(" ; ");
    }
  } catch {
    // Le corps n'est pas du JSON : le statut suffit.
  }
  return `le serveur répond ${response.status}`;
};

export const ask = async <Value>(
  path: string,
  init: RequestInit,
  toValue: (body: unknown) => Value | undefined,
): Promise<Answer<Value>> => {
  try {
    const response = await fetch(path, init);
    if (!response.ok) return { ok: false, message: await toRefusal(response) };
    const value = toValue(await response.json());
    return value === undefined ? { ok: false, message: "réponse illisible" } : { ok: true, value };
  } catch (error) {
    console.error("Expressions : le serveur ne répond pas", error);
    return { ok: false, message: "le serveur ne répond pas" };
  }
};

const asJson = (method: "POST" | "PUT", body: ExpressionInput): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const listExpressions = (): Promise<Answer<ExpressionSummary[]>> =>
  ask("/api/expressions", { method: "GET" }, (body) => {
    const list = ExpressionListSchema.safeParse(body);
    return list.success ? list.data.expressions : undefined;
  });

export const getExpressionDetail = (id: string): Promise<Answer<ExpressionDetail>> =>
  ask(`/api/expressions/${encodeURIComponent(id)}`, { method: "GET" }, (body) => {
    const detail = ExpressionDetailSchema.safeParse(body);
    return detail.success ? detail.data : undefined;
  });

const toSummary = (body: unknown): ExpressionSummary | undefined => {
  const summary = ExpressionSummarySchema.safeParse(body);
  return summary.success ? summary.data : undefined;
};

export const createExpression = (input: ExpressionInput): Promise<Answer<ExpressionSummary>> =>
  ask("/api/expressions", asJson("POST", input), toSummary);

export const updateExpression = (id: string, input: ExpressionInput): Promise<Answer<ExpressionSummary>> =>
  ask(`/api/expressions/${encodeURIComponent(id)}`, asJson("PUT", input), toSummary);

export const deleteExpression = (id: string): Promise<Answer<string>> =>
  ask(`/api/expressions/${encodeURIComponent(id)}`, { method: "DELETE" }, () => id);
