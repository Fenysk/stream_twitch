import { z } from "zod";
import type { ChatViewer } from "../domain/chat-viewers.schema";
import type { ChatViewersPort, ChatViewersResult } from "../usecase/control.usecase";
import type { ChatViewersReaderResult } from "../usecase/twitch-connection.usecase";

export type ChatViewersSettings = {
  clientId: string;
  // L'identifiant Twitch de la chaîne (`chatChannelId`) ; sans lui, rien ne se lit.
  broadcasterId: string | undefined;
  // De quoi lire la liste au nom d'Alexis : son jeton d'accès (renouvelé s'il le faut) et son compte ; ou pourquoi on ne peut pas.
  getReader: (isForced: boolean) => Promise<ChatViewersReaderResult>;
  // Le réseau et l'adresse de Twitch sont injectés : les tests parlent à un faux Twitch, jamais au vrai.
  fetcher?: typeof fetch;
  apiUrl?: string;
  delayMs?: number;
};

const DEFAULT_API_URL = "https://api.twitch.tv";
const DEFAULT_DELAY_MS = 10_000;
const CHAT_VIEWERS_PATH = "/helix/chat/chatters";
// Twitch rend 1000 personnes au plus par page ; la liste d'une chaîne bien plus grande que ça s'arrête après ce nombre de pages.
const PAGE_SIZE = "1000";
const PAGES_MAX = 50;

export const RECONNECT_MESSAGE =
  "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus";
export const CONNECT_MESSAGE = "Connecte Twitch dans l'onglet Twitch : la liste passe par ton compte";
const MISSING_CHANNEL = "l'identifiant de la chaîne (chatChannelId) manque dans settings.json";

// Twitch écrit `user_id`, `user_name`, `pagination`… en snake_case ou en objet : ces champs se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());
type Fields = z.infer<typeof ObjectSchema>;

const fail = (status: number, message: string): ChatViewersResult => ({ ok: false, status, message });

const getFields = (value: unknown): Fields => {
  const parsed = ObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

// La raison que Twitch donne à un refus (`message`) : elle ne porte jamais un jeton, seulement « Missing scope: moderator:read:chatters ».
const toReason = async (response: Response): Promise<string> => {
  const message = getFields(await response.json().catch(() => undefined)).message;
  return typeof message === "string" ? message : "";
};

const toDetail = (reason: string): string => (reason === "" ? "" : ` (${reason})`);

// Le refus de Twitch, dit en français. 401 : le jeton est refusé même renouvelé, il faut se reconnecter. 403 : le compte n'est pas modérateur
// de la chaîne, ou il manque le droit.
const toRefusal = (status: number, reason: string): ChatViewersResult => {
  switch (status) {
    case 400:
      return fail(400, `Twitch refuse la demande${toDetail(reason)}`);
    case 401:
      return fail(401, RECONNECT_MESSAGE);
    case 403:
      return fail(403, `Twitch ne laisse pas ce compte lire la liste du chat${toDetail(reason)}`);
    case 429:
      return fail(429, "Twitch limite les demandes : réessaie dans un instant");
    default:
      return fail(502, `Twitch répond ${status}${toDetail(reason)}`);
  }
};

// Les personnes d'une page (`data`) : l'identifiant et le pseudo affiché (`user_name`, à défaut le login) ; une ligne illisible est laissée de côté.
const toChatViewers = (rows: unknown): ChatViewer[] => {
  const parsed = z.array(ObjectSchema).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.flatMap((row) => {
    const id = row.user_id;
    const nickname = row.user_name || row.user_login;
    return typeof id === "string" && id !== "" && typeof nickname === "string" && nickname !== ""
      ? [{ id, nickname }]
      : [];
  });
};

// Le curseur de la page suivante (`pagination.cursor`), ou rien à la dernière page.
const toCursor = (body: Fields): string | undefined => {
  const cursor = getFields(body.pagination).cursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : undefined;
};

// Lire qui est connecté au chat de la chaîne, au nom d'Alexis (modérateur de sa chaîne), par l'API Helix (`GET /chat/chatters`, droit
// `moderator:read:chatters`), en suivant la pagination. Les messages d'erreur ne portent jamais le jeton.
export function createChatViewersClient({
  clientId,
  broadcasterId,
  getReader,
  fetcher = fetch,
  apiUrl = DEFAULT_API_URL,
  delayMs = DEFAULT_DELAY_MS,
}: ChatViewersSettings): ChatViewersPort {
  // Une page avec le jeton demandé ; sans jeton valable, la réponse toute faite.
  const getPage = async (
    isForced: boolean,
    channel: string,
    cursor: string | undefined,
  ): Promise<Response | ChatViewersResult> => {
    const reader = await getReader(isForced);
    if (!reader.ok) return fail(401, reader.reason === "missing-scope" ? RECONNECT_MESSAGE : CONNECT_MESSAGE);
    // Twitch écrit les champs en snake_case : la demande se compose depuis des paires.
    const query = new URLSearchParams([
      ["broadcaster_id", channel],
      ["moderator_id", reader.reader.userId],
      ["first", PAGE_SIZE],
      ...(cursor === undefined ? [] : [["after", cursor] as [string, string]]),
    ]);
    return fetcher(`${apiUrl}${CHAT_VIEWERS_PATH}?${query.toString()}`, {
      headers: { authorization: `Bearer ${reader.reader.accessToken}`, "client-id": clientId },
      signal: AbortSignal.timeout(delayMs),
    });
  };

  // Une page ; Twitch ne reconnaît plus le jeton (401) : un autre, une fois.
  const getPageRetrying = async (channel: string, cursor: string | undefined) => {
    const answer = await getPage(false, channel, cursor);
    return answer instanceof Response && answer.status === 401 ? getPage(true, channel, cursor) : answer;
  };

  // Les pages l'une après l'autre, jusqu'à la dernière (ou `PAGES_MAX`) ; le premier refus arrête tout.
  const getAll = async (channel: string): Promise<ChatViewersResult> => {
    const chatViewers: ChatViewer[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < PAGES_MAX; page += 1) {
      const answer = await getPageRetrying(channel, cursor);
      if (!(answer instanceof Response)) return answer;
      if (!answer.ok) return toRefusal(answer.status, await toReason(answer));
      const body = getFields(await answer.json().catch(() => undefined));
      chatViewers.push(...toChatViewers(body.data));
      cursor = toCursor(body);
      if (cursor === undefined) break;
    }
    return { ok: true, chatViewers };
  };

  return {
    async list() {
      if (broadcasterId === undefined) return fail(409, MISSING_CHANNEL);
      try {
        return await getAll(broadcasterId);
      } catch (error) {
        return fail(502, `Twitch ne répond pas (${error instanceof Error ? error.message : "réseau"}).`);
      }
    },
  };
}
