import { describe, expect, it } from "vitest";
import type { ChatViewersReaderResult } from "../usecase/twitch-connection.usecase";
import {
  type ChatViewersSettings,
  CONNECT_MESSAGE,
  createChatViewersClient,
  RECONNECT_MESSAGE,
} from "./twitch-chat-viewers.client";

const READER: ChatViewersReaderResult = { ok: true, reader: { accessToken: "ACCESS-1", userId: "42" } };

// Twitch écrit les champs en snake_case : les corps se composent depuis des paires.
const fields = (...pairs: [string, unknown][]): Record<string, unknown> => Object.fromEntries(pairs);
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const row = (id: string, name: string, login = name.toLowerCase()) =>
  fields(["user_id", id], ["user_login", login], ["user_name", name]);
const page = (rows: Record<string, unknown>[], cursor?: string): Response =>
  json(
    200,
    fields(
      ["data", rows],
      ["pagination", cursor === undefined ? {} : fields(["cursor", cursor])],
      ["total", 3],
    ),
  );

// Un faux réseau : les réponses suivent une liste, chaque appel est noté. `readers` : ce que la connexion rend à chaque demande.
const setup = (
  replies: (Response | Error)[],
  readers: ChatViewersReaderResult[] = [READER],
  overrides: Partial<ChatViewersSettings> = {},
) => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const wasForced: boolean[] = [];
  const queue = [...replies];
  const client = createChatViewersClient({
    clientId: "mon-client",
    broadcasterId: "99",
    getReader: async (isForced) => {
      wasForced.push(isForced);
      return readers.shift() ?? READER;
    },
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init });
      const reply = queue.shift() ?? page([]);
      if (reply instanceof Error) throw reply;
      return reply;
    },
    apiUrl: "https://api.test",
    ...overrides,
  });
  return { client, requests, wasForced };
};

describe("createChatViewersClient : la liste du chat", () => {
  it("lit la liste avec le jeton d'Alexis, la chaîne comme `broadcaster_id` et son compte comme `moderator_id`", async () => {
    const { client, requests } = setup([page([row("1", "Alice"), row("2", "Bob")])]);
    expect(await client.list()).toEqual({
      ok: true,
      chatViewers: [
        { id: "1", nickname: "Alice" },
        { id: "2", nickname: "Bob" },
      ],
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://api.test/helix/chat/chatters");
    expect(url.searchParams.get("broadcaster_id")).toBe("99");
    expect(url.searchParams.get("moderator_id")).toBe("42");
    expect(url.searchParams.get("first")).toBe("1000");
    expect(url.searchParams.get("after")).toBeNull();
    expect(requests[0]?.init?.headers).toEqual({
      authorization: "Bearer ACCESS-1",
      "client-id": "mon-client",
    });
  });

  it("suit la pagination : chaque page repart du curseur de la précédente, jusqu'à la dernière", async () => {
    const { client, requests } = setup([
      page([row("1", "Alice")], "c1"),
      page([row("2", "Bob")], "c2"),
      page([row("3", "Chloé")]),
    ]);
    const result = await client.list();
    expect(result).toEqual({
      ok: true,
      chatViewers: [
        { id: "1", nickname: "Alice" },
        { id: "2", nickname: "Bob" },
        { id: "3", nickname: "Chloé" },
      ],
    });
    expect(requests.map(({ url }) => new URL(url).searchParams.get("after"))).toEqual([null, "c1", "c2"]);
  });

  it("n'écrit pas ses pages sans fin : il s'arrête après 50 pages", async () => {
    const replies = Array.from({ length: 80 }, (_, index) =>
      page([row(String(index), `viewer${index}`)], "encore"),
    );
    const { client, requests } = setup(replies);
    const result = await client.list();
    expect(requests).toHaveLength(50);
    expect(result.ok && result.chatViewers).toHaveLength(50);
  });

  it("prend le login quand Twitch ne donne pas de pseudo affiché, et laisse de côté une ligne illisible", async () => {
    const { client } = setup([
      page([
        fields(["user_id", "1"], ["user_login", "alice"], ["user_name", ""]),
        fields(["user_login", "sans-id"]),
        fields(["user_id", "3"]),
        row("4", "Dora"),
      ]),
    ]);
    expect(await client.list()).toEqual({
      ok: true,
      chatViewers: [
        { id: "1", nickname: "alice" },
        { id: "4", nickname: "Dora" },
      ],
    });
  });

  it("rend une liste vide quand personne n'est connecté", async () => {
    expect(await setup([page([])]).client.list()).toEqual({ ok: true, chatViewers: [] });
  });

  it("Si le jeton gardé est d'avant le droit de lire la liste, alors le système doit dire de reconnecter Twitch, sans rien demander à Twitch", async () => {
    const { client, requests } = setup([], [{ ok: false, reason: "missing-scope" }]);
    expect(await client.list()).toEqual({ ok: false, status: 401, message: RECONNECT_MESSAGE });
    expect(requests).toEqual([]);
    expect(RECONNECT_MESSAGE).toBe(
      "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus",
    );
  });

  it("Si Alexis n'est pas connecté, alors le système doit dire de connecter Twitch, sans rien demander à Twitch", async () => {
    const { client, requests } = setup([], [{ ok: false, reason: "disconnected" }]);
    expect(await client.list()).toEqual({ ok: false, status: 401, message: CONNECT_MESSAGE });
    expect(requests).toEqual([]);
  });

  it("Quand Twitch refuse le jeton (401), le système doit en demander un autre, une fois, et lire la liste avec lui", async () => {
    const second: ChatViewersReaderResult = { ok: true, reader: { accessToken: "ACCESS-2", userId: "42" } };
    const { client, requests, wasForced } = setup(
      [json(401, fields(["message", "Invalid OAuth token"])), page([row("1", "Alice")])],
      [READER, second],
    );
    expect(await client.list()).toEqual({ ok: true, chatViewers: [{ id: "1", nickname: "Alice" }] });
    expect(wasForced).toEqual([false, true]);
    expect(requests.map(({ init }) => new Headers(init?.headers).get("authorization"))).toEqual([
      "Bearer ACCESS-1",
      "Bearer ACCESS-2",
    ]);
  });

  it("dit de reconnecter Twitch quand le jeton est encore refusé après le renouvellement", async () => {
    const { client, requests } = setup([json(401, {}), json(401, {})]);
    expect(await client.list()).toEqual({ ok: false, status: 401, message: RECONNECT_MESSAGE });
    expect(requests).toHaveLength(2);
  });

  it("dit en français le refus de Twitch : compte qui n'est pas modérateur (403), trop de demandes (429), panne (500)", async () => {
    const forbidden = await setup([
      json(403, fields(["message", "Missing scope: moderator:read:chatters"])),
    ]).client.list();
    expect(forbidden).toEqual({
      ok: false,
      status: 403,
      message:
        "Twitch ne laisse pas ce compte lire la liste du chat (Missing scope: moderator:read:chatters)",
    });
    expect(await setup([json(429, {})]).client.list()).toEqual({
      ok: false,
      status: 429,
      message: "Twitch limite les demandes : réessaie dans un instant",
    });
    expect(await setup([json(500, {})]).client.list()).toEqual({
      ok: false,
      status: 502,
      message: "Twitch répond 500",
    });
  });

  it("dit que Twitch ne répond pas quand le réseau tombe, sans le jeton dans la phrase", async () => {
    const result = await setup([new Error("ECONNREFUSED")]).client.list();
    expect(result).toEqual({ ok: false, status: 502, message: "Twitch ne répond pas (ECONNREFUSED)." });
    expect(JSON.stringify(result)).not.toContain("ACCESS");
  });

  it("dit que la chaîne manque dans settings.json quand `chatChannelId` n'est pas réglé", async () => {
    const { client, requests } = setup([], [READER], { broadcasterId: undefined });
    expect(await client.list()).toEqual({
      ok: false,
      status: 409,
      message: "l'identifiant de la chaîne (chatChannelId) manque dans settings.json",
    });
    expect(requests).toEqual([]);
  });
});
