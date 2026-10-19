import { z } from "zod";
import type { ChatWriterPort, ControlResult } from "../usecase/control.usecase";
import type { ChatSenderResult } from "../usecase/twitch-connection.usecase";

export type ChatWriterSettings = {
  clientId: string;
  // L'identifiant Twitch de la chaîne (`chatChannelId`) ; sans lui, rien ne s'écrit.
  broadcasterId: string | undefined;
  // De quoi écrire au nom d'Alexis : son jeton d'accès (renouvelé s'il le faut) et son compte ; ou pourquoi on ne peut pas.
  getSender: (isForced: boolean) => Promise<ChatSenderResult>;
  // Le réseau et l'adresse de Twitch sont injectés : les tests parlent à un faux Twitch, jamais au vrai.
  fetcher?: typeof fetch;
  apiUrl?: string;
  delayMs?: number;
};

const DEFAULT_API_URL = "https://api.twitch.tv";
const DEFAULT_DELAY_MS = 10_000;
const MESSAGES_PATH = "/helix/chat/messages";

export const RECONNECT_MESSAGE =
  "Reconnecte Twitch dans l'onglet Twitch : l'écriture demande une autorisation de plus";
export const CONNECT_MESSAGE = "Connecte Twitch dans l'onglet Twitch : l'écriture passe par ton compte";
const MISSING_CHANNEL = "l'identifiant de la chaîne (chatChannelId) manque dans settings.json";

// Twitch écrit `is_sent`, `drop_reason`, `broadcaster_id`… en snake_case : ces champs se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());
type Fields = z.infer<typeof ObjectSchema>;

const fail = (status: number, message: string): ControlResult => ({ ok: false, status, message });

const getFields = (value: unknown): Fields => {
  const parsed = ObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

// Le texte `message` d'un objet de Twitch, vide s'il n'y en a pas.
const toText = (fields: Fields): string => (typeof fields.message === "string" ? fields.message : "");

// La raison que Twitch donne à un refus (`message`) : elle ne porte jamais un jeton, seulement « Missing scope: user:write:chat ».
const toReason = async (response: Response): Promise<string> =>
  toText(getFields(await response.json().catch(() => undefined)));

// La première réponse de `data` : le message publié ou non, et la raison quand il ne l'est pas.
const getFirstRow = (body: Fields): Fields | undefined => {
  const rows = z.array(ObjectSchema).safeParse(body.data);
  return rows.success ? rows.data[0] : undefined;
};

const toDetail = (reason: string): string => (reason === "" ? "" : ` (${reason})`);

// Le refus de Twitch, dit en français. 401 : le jeton est refusé même renouvelé, il faut se reconnecter.
const toRefusal = (status: number, reason: string): ControlResult => {
  switch (status) {
    case 400:
      return fail(400, `Twitch refuse ce message${toDetail(reason)}`);
    case 401:
      return fail(401, RECONNECT_MESSAGE);
    case 403:
      return fail(403, `Twitch ne laisse pas ce compte écrire dans ce chat${toDetail(reason)}`);
    case 422:
      return fail(422, "le message est trop long pour Twitch");
    case 429:
      return fail(429, "Twitch limite les messages : réessaie dans un instant");
    default:
      return fail(502, `Twitch répond ${status}${toDetail(reason)}`);
  }
};

// Un message accepté par Twitch peut quand même ne pas partir (filtre du chat, mot bloqué) : `is_sent` à faux, avec sa raison.
const toResult = async (response: Response): Promise<ControlResult> => {
  if (!response.ok) return toRefusal(response.status, await toReason(response));
  const row = getFirstRow(getFields(await response.json().catch(() => undefined)));
  if (!row) return fail(502, "la réponse de Twitch est illisible");
  if (row.is_sent === true) return { ok: true };
  return fail(422, `Twitch n'a pas publié le message${toDetail(toText(getFields(row.drop_reason)))}`);
};

// Écrire un message dans le chat de la chaîne, au nom d'Alexis, par l'API Helix (`POST /chat/messages`, droit `user:write:chat`).
// Les messages d'erreur ne portent jamais le jeton : le refus de Twitch, dit en français, ou « Twitch ne répond pas ».
export function createChatWriterClient({
  clientId,
  broadcasterId,
  getSender,
  fetcher = fetch,
  apiUrl = DEFAULT_API_URL,
  delayMs = DEFAULT_DELAY_MS,
}: ChatWriterSettings): ChatWriterPort {
  // L'appel avec le jeton demandé ; sans jeton valable à écrire, la réponse toute faite.
  const post = async (
    isForced: boolean,
    channel: string,
    text: string,
  ): Promise<Response | ControlResult> => {
    const sender = await getSender(isForced);
    if (!sender.ok) return fail(401, sender.reason === "missing-scope" ? RECONNECT_MESSAGE : CONNECT_MESSAGE);
    return fetcher(`${apiUrl}${MESSAGES_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sender.sender.accessToken}`,
        "client-id": clientId,
        "content-type": "application/json",
      },
      // Twitch écrit les champs en snake_case : le corps se compose depuis des paires.
      body: JSON.stringify(
        Object.fromEntries([
          ["broadcaster_id", channel],
          ["sender_id", sender.sender.userId],
          ["message", text],
        ]),
      ),
      signal: AbortSignal.timeout(delayMs),
    });
  };

  return {
    async send(text) {
      if (broadcasterId === undefined) return fail(409, MISSING_CHANNEL);
      try {
        let answer = await post(false, broadcasterId, text);
        // Twitch ne reconnaît plus ce jeton (401) : un autre, une fois.
        if (answer instanceof Response && answer.status === 401)
          answer = await post(true, broadcasterId, text);
        return answer instanceof Response ? await toResult(answer) : answer;
      } catch (error) {
        return fail(502, `Twitch ne répond pas (${error instanceof Error ? error.message : "réseau"}).`);
      }
    },
  };
}
