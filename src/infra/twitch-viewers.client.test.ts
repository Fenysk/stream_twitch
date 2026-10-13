import { describe, expect, it } from "vitest";
import { createViewersClient } from "./twitch-viewers.client";

const SECRET = "le-secret-de-l-app";
const TOKEN = "jeton-d-application";

type Call = { url: string; init: RequestInit | undefined };

// Twitch écrit ses champs en snake_case : les réponses se posent depuis du JSON, tel qu'il arrive.
const json = (body: string, status = 200): Response => new Response(body, { status });
const STREAMS_OF_42 = '{ "data": [{ "viewer_count": 42 }] }';
const STREAMS_OF_7 = '{ "data": [{ "viewer_count": 7 }] }';
const TOKEN_BODY = `{ "access_token": "${TOKEN}", "expires_in": 3600, "token_type": "bearer" }`;

// Un faux Twitch : il note chaque appel et répond selon l'adresse. Les tests n'appellent jamais le vrai.
const setup = (
  handlers: { token?: () => Response; streams?: () => Response } = {},
  options: { channelId?: string | undefined } = {},
) => {
  const calls: Call[] = [];
  const state = { now: 1_000_000 };
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://id.twitch.tv/oauth2/token"))
      return handlers.token?.() ?? json(TOKEN_BODY);
    return handlers.streams?.() ?? json(STREAMS_OF_42);
  }) as typeof fetch;
  const port = createViewersClient({
    clientId: "mon-client",
    clientSecret: SECRET,
    channelId: "channelId" in options ? options.channelId : "68710381",
    fetcher,
    clock: () => state.now,
  });
  return { port, calls, state };
};

describe("createViewersClient : le nombre de viewers par l'API Helix", () => {
  it("demande un jeton d'application, puis le live de la chaîne, et rend viewer_count", async () => {
    const { port, calls } = setup();
    expect(await port.get()).toBe(42);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://id.twitch.tv/oauth2/token");
    expect(calls[0]?.init?.method).toBe("POST");
    const form = new URLSearchParams(String(calls[0]?.init?.body));
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("client_id")).toBe("mon-client");
    expect(form.get("client_secret")).toBe(SECRET);
    expect(calls[1]?.url).toBe("https://api.twitch.tv/helix/streams?user_id=68710381");
    const headers = new Headers(calls[1]?.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("client-id")).toBe("mon-client");
  });

  it("n'écrit jamais le secret dans une adresse : il part dans le corps de la demande du jeton", async () => {
    const { port, calls } = setup();
    await port.get();
    for (const { url } of calls) expect(url).not.toContain(SECRET);
    expect(String(calls[0]?.init?.body)).toContain(SECRET);
  });

  it("garde le jeton d'application : la deuxième demande ne le redemande pas", async () => {
    const { port, calls } = setup();
    await port.get();
    await port.get();
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(1);
    expect(calls.filter(({ url }) => url.includes("helix/streams"))).toHaveLength(2);
  });

  it("renouvelle le jeton une minute avant la fin de sa validité", async () => {
    const { port, calls, state } = setup();
    await port.get();
    state.now += 3_539_000;
    await port.get();
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(1);
    state.now += 1_000;
    await port.get();
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(2);
  });

  it("redemande un jeton une fois quand Twitch le refuse (401), puis réessaie", async () => {
    let attempts = 0;
    const { port, calls } = setup({
      streams: () => {
        attempts += 1;
        return attempts === 1 ? json("{}", 401) : json(STREAMS_OF_7);
      },
    });
    expect(await port.get()).toBe(7);
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(2);
  });

  it("rend null quand le live est hors ligne : la liste des streams est vide", async () => {
    const { port } = setup({ streams: () => json('{ "data": [] }') });
    expect(await port.get()).toBeNull();
  });

  it("rend null sans identifiant de chaîne, sans rien demander à Twitch", async () => {
    const { port, calls } = setup({}, { channelId: undefined });
    expect(await port.get()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("lève sur un autre code HTTP, sans le jeton ni le secret dans le message", async () => {
    const { port } = setup({ streams: () => json("{}", 503) });
    await expect(port.get()).rejects.toThrow("HTTP 503");
    const refused = setup({ token: () => json('{ "message": "invalid client secret" }', 403) });
    const error = await refused.port.get().catch((caught: unknown) => caught);
    expect(String(error)).toContain("HTTP 403");
    expect(String(error)).not.toContain(SECRET);
  });

  it("lève sur une réponse illisible, sans rien dire de son contenu", async () => {
    const html = setup({ streams: () => new Response("<html>maintenance</html>", { status: 200 }) });
    await expect(html.port.get()).rejects.toThrow("réponse illisible");
    const badToken = setup({ token: () => json('{ "access_token": 12 }') });
    await expect(badToken.port.get()).rejects.toThrow("jeton d'application illisible");
  });

  it("lève quand le réseau tombe", async () => {
    const port = createViewersClient({
      clientId: "mon-client",
      clientSecret: SECRET,
      channelId: "68710381",
      fetcher: (async () => {
        throw new Error("fetch failed");
      }) as typeof fetch,
    });
    await expect(port.get()).rejects.toThrow("fetch failed");
  });

  it("borne l'attente par un délai", async () => {
    const { port, calls } = setup();
    await port.get();
    for (const { init } of calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
