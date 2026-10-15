import { toViewersTitle } from "../../src/domain/viewers.rules";
import { ViewersStateSchema } from "../../src/domain/viewers.schema";

// Ce que fetch sait faire pour la touche : une URL et un signal d'abandon.
export type FetchFn = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 3000;
// Le serveur ne répond pas : arrêté, port fermé ou trop lent.
const SERVER_DOWN_TITLE = "Serveur\néteint";
// Le serveur répond autre chose que la route attend : un 404 d'avant la route (il n'a pas redémarré), un corps illisible.
const SERVER_TO_RESTART_TITLE = "Serveur\nà relancer";

export const readViewersTitle = async (url: string, fetchFn: FetchFn = fetch): Promise<string> => {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchFn(url, { signal });
  } catch {
    return SERVER_DOWN_TITLE;
  }
  if (!response.ok) return SERVER_TO_RESTART_TITLE;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Le délai peut tomber pendant la lecture du corps : c'est un serveur qui ne finit pas de répondre.
    return signal.aborted ? SERVER_DOWN_TITLE : SERVER_TO_RESTART_TITLE;
  }
  const state = ViewersStateSchema.safeParse(body);
  return state.success ? toViewersTitle(state.data) : SERVER_TO_RESTART_TITLE;
};
