import { describe, expect, it } from "vitest";
import type { ChatSenderResult } from "../usecase/twitch-connection.usecase";
import {
  type ChatWriterSettings,
  CONNECT_MESSAGE,
  createChatWriterClient,
  RECONNECT_MESSAGE,
} from "./twitch-chat.client";

const SENDER: ChatSenderResult = { ok: true, sender: { accessToken: "ACCESS-1", userId: "42" } };

// Twitch écrit les champs en snake_case : les corps se composent depuis des paires.
const fields = (...pairs: [string, unknown][]): Record<string, unknown> => Object.fromEntries(pairs);
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const published = (): Response =>
  json(200, fields(["data", [fields(["message_id", "m"], ["is_sent", true])]]));
// Un message accepté sans être publié, avec ou sans raison.
const dropped = (reason?: string): Response => {
  const row: [string, unknown][] = [
    ["message_id", ""],
    ["is_sent", false],
  ];
  if (reason !== undefined) row.push(["drop_reason", fields(["code", "msg_rejected"], ["message", reason])]);
  return json(200, fields(["data", [fields(...row)]]));
};

// Un faux réseau : les réponses suivent une liste, chaque appel est noté. `senders` : ce que la connexion rend à chaque demande.
const setup = (
  replies: (Response | Error)[],
  senders: ChatSenderResult[] = [SENDER],
  overrides: Partial<ChatWriterSettings> = {},
) => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const wasForced: boolean[] = [];
  const queue = [...replies];
  const writer = createChatWriterClient({
    clientId: "mon-client",
    broadcasterId: "99",
    getSender: async (isForced) => {
      wasForced.push(isForced);
      return senders.shift() ?? SENDER;
    },
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init });
      const reply = queue.shift() ?? published();
      if (reply instanceof Error) throw reply;
      return reply;
    },
    apiUrl: "https://api.test",
    ...overrides,
  });
  return { writer, requests, wasForced };
};

describe("createChatWriterClient : écrire dans le chat", () => {
  it("envoie le message avec le jeton d'Alexis, son compte comme expéditeur et la chaîne comme destinataire", async () => {
    const { writer, requests } = setup([]);
    expect(await writer.send("Salut")).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.test/helix/chat/messages");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toEqual({
      authorization: "Bearer ACCESS-1",
      "client-id": "mon-client",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(
      fields(["broadcaster_id", "99"], ["sender_id", "42"], ["message", "Salut"]),
    );
  });

  it("Quand Twitch accepte le message sans le publier, le système doit dire pourquoi", async () => {
    expect(await setup([dropped("mot bloqué")]).writer.send("Salut")).toEqual({
      ok: false,
      status: 422,
      message: "Twitch n'a pas publié le message (mot bloqué)",
    });
    expect(await setup([dropped()]).writer.send("Salut")).toEqual({
      ok: false,
      status: 422,
      message: "Twitch n'a pas publié le message",
    });
  });

  it("dit les refus de Twitch en français : message refusé, compte refusé, trop long, trop de messages, panne", async () => {
    const answers: [number, string, string, number][] = [
      [400, "Missing required parameter", "Twitch refuse ce message (Missing required parameter)", 400],
      [403, "Banned", "Twitch ne laisse pas ce compte écrire dans ce chat (Banned)", 403],
      [422, "", "le message est trop long pour Twitch", 422],
      [429, "", "Twitch limite les messages : réessaie dans un instant", 429],
      [500, "oups", "Twitch répond 500 (oups)", 502],
    ];
    for (const [status, reason, message, expected] of answers) {
      const result = await setup([json(status, fields(["message", reason]))]).writer.send("Salut");
      expect(result).toEqual({ ok: false, status: expected, message });
    }
  });

  it("Quand Twitch refuse le jeton (401), le système doit en demander un autre, une fois, et réessayer", async () => {
    const { writer, requests, wasForced } = setup(
      [json(401, fields(["message", "Invalid OAuth token"])), published()],
      [SENDER, { ok: true, sender: { accessToken: "ACCESS-2", userId: "42" } }],
    );
    expect(await writer.send("Salut")).toEqual({ ok: true });
    expect(wasForced).toEqual([false, true]);
    expect(requests.map(({ init }) => new Headers(init?.headers).get("authorization"))).toEqual([
      "Bearer ACCESS-1",
      "Bearer ACCESS-2",
    ]);
  });

  it("Si le jeton est refusé deux fois, alors le système doit dire de reconnecter Twitch", async () => {
    const { writer, requests } = setup([json(401, {}), json(401, {})]);
    expect(await writer.send("Salut")).toEqual({ ok: false, status: 401, message: RECONNECT_MESSAGE });
    expect(requests).toHaveLength(2);
  });

  it("dit de reconnecter Twitch quand le jeton n'a pas le droit d'écrire, et de le connecter quand il n'y en a pas, sans appeler Twitch", async () => {
    const missing = setup([], [{ ok: false, reason: "missing-scope" }]);
    expect(await missing.writer.send("Salut")).toEqual({
      ok: false,
      status: 401,
      message: RECONNECT_MESSAGE,
    });
    const disconnected = setup([], [{ ok: false, reason: "disconnected" }]);
    expect(await disconnected.writer.send("Salut")).toEqual({
      ok: false,
      status: 401,
      message: CONNECT_MESSAGE,
    });
    expect(missing.requests).toEqual([]);
    expect(disconnected.requests).toEqual([]);
  });

  it("refuse (409) sans appeler Twitch quand l'identifiant de la chaîne manque dans les réglages", async () => {
    const { writer, requests } = setup([], [SENDER], { broadcasterId: undefined });
    expect(await writer.send("Salut")).toEqual({
      ok: false,
      status: 409,
      message: "l'identifiant de la chaîne (chatChannelId) manque dans settings.json",
    });
    expect(requests).toEqual([]);
  });

  it("dit que Twitch ne répond pas quand le réseau tombe, sans lever, et sans jeton dans la phrase", async () => {
    const { writer } = setup([new Error("ECONNRESET")]);
    const result = await writer.send("Salut");
    expect(result).toEqual({ ok: false, status: 502, message: "Twitch ne répond pas (ECONNRESET)." });
    expect(JSON.stringify(result)).not.toContain("ACCESS-1");
  });

  it("dit que la réponse est illisible quand Twitch répond 200 sans données", async () => {
    const result = await setup([json(200, { autre: true })]).writer.send("Salut");
    expect(result).toEqual({ ok: false, status: 502, message: "la réponse de Twitch est illisible" });
  });
});
