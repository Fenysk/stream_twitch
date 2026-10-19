import { SettingsRefusalSchema } from "../../src/domain/settings.schema";

// Ce que fetch sait faire pour une touche : une URL, un signal d'abandon, et pour écrire une méthode, un en-tête et un corps.
export type FetchInit = {
  signal: AbortSignal;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};
export type FetchFn = (url: string, init: FetchInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 3000;
// Le serveur ne répond pas : arrêté, port fermé ou trop lent.
export const SERVER_DOWN_TITLE = "Serveur\néteint";
// Le serveur répond autre chose que la route attend : un 404 d'avant la route (il n'a pas redémarré), un corps illisible.
export const SERVER_TO_RESTART_TITLE = "Serveur\nà relancer";

// Une réponse du serveur : son statut et son corps JSON, `undefined` quand le corps n'en est pas.
export type ServerReply = { kind: "down" } | { kind: "reply"; status: number; isOk: boolean; body: unknown };

export type ServerRequest = {
  method: string;
  body: unknown;
  timeoutMs?: number;
};

// Le JSON est obligatoire pour écrire : le serveur refuse tout autre corps (http.ts, isJson).
export const requestServer = async (
  url: string,
  fetchFn: FetchFn,
  request?: ServerRequest,
): Promise<ServerReply> => {
  const signal = AbortSignal.timeout(request?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchFn(
      url,
      request
        ? {
            signal,
            method: request.method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request.body),
          }
        : { signal },
    );
  } catch {
    return { kind: "down" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Le délai peut tomber pendant la lecture du corps : c'est un serveur qui ne finit pas de répondre.
    if (signal.aborted) return { kind: "down" };
  }
  return { kind: "reply", status: response.status, isOk: response.ok, body };
};

// Lire un JSON que le serveur doit donner : tout le reste dit pourquoi on ne l'a pas.
export type JsonRead = { kind: "down" } | { kind: "to-restart" } | { kind: "json"; body: unknown };

export const readJson = async (url: string, fetchFn: FetchFn): Promise<JsonRead> => {
  const reply = await requestServer(url, fetchFn);
  if (reply.kind === "down") return reply;
  return reply.isOk && reply.body !== undefined ? { kind: "json", body: reply.body } : { kind: "to-restart" };
};

// Ce qu'un appui qui écrit apprend du serveur : fait, injoignable, ou refusé avec son statut et sa phrase.
export type PostOutcome =
  | { ok: true }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "refused"; status: number; message: string | undefined };

// Un POST JSON sur une route du serveur. Tous les refus du serveur ont la même forme : { issues: [{ path, message }] } (http.ts, refuse).
export const postServer = async (
  url: string,
  body: unknown,
  timeoutMs: number,
  fetchFn: FetchFn,
): Promise<PostOutcome> => {
  const reply = await requestServer(url, fetchFn, { method: "POST", body, timeoutMs });
  if (reply.kind === "down") return { ok: false, reason: "unavailable" };
  if (reply.isOk) return { ok: true };
  const refusal = SettingsRefusalSchema.safeParse(reply.body);
  return {
    ok: false,
    reason: "refused",
    status: reply.status,
    message: refusal.success ? refusal.data.issues[0]?.message : undefined,
  };
};
