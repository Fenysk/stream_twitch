import { describe, expect, it } from "vitest";
import { createTwitchAuthClient } from "./twitch-auth.client";

const SECRET = "le-secret-de-l-app";

type Call = { url: string; init: RequestInit | undefined };

// Un faux Twitch : il note chaque appel et rend la réponse posée. Les tests n'appellent jamais le vrai.
const setup = (respond: () => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond();
  }) as typeof fetch;
  const client = createTwitchAuthClient({ clientId: "mon-client", clientSecret: SECRET, fetcher });
  return { client, calls };
};

const text = (body: string, status = 200): Response => new Response(body, { status });
const GRANT =
  '{ "access_token": "ACCESS-X", "refresh_token": "REFRESH-X", "expires_in": 14400, "token_type": "bearer" }';
const IDENTITY =
  '{ "client_id": "mon-client", "login": "fenysk", "scopes": ["moderator:read:followers"], "user_id": "68710381", "expires_in": 14000 }';

const formOf = (call: Call | undefined): URLSearchParams => new URLSearchParams(String(call?.init?.body));

describe("exchangeCode : le code du retour contre un jeton", () => {
  it("POST sur /oauth2/token avec le code, le secret et l'adresse de retour exacte", async () => {
    const { client, calls } = setup(() => text(GRANT));
    await client.exchangeCode("CODE-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://id.twitch.tv/oauth2/token");
    expect(calls[0]?.init?.method).toBe("POST");
    const form = formOf(calls[0]);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("CODE-1");
    expect(form.get("client_id")).toBe("mon-client");
    expect(form.get("client_secret")).toBe(SECRET);
    expect(form.get("redirect_uri")).toBe("http://localhost:4747/auth/twitch/callback");
  });

  it("n'écrit jamais le code ni le secret dans l'adresse", async () => {
    const { client, calls } = setup(() => text(GRANT));
    await client.exchangeCode("CODE-1");
    expect(calls[0]?.url).not.toContain("CODE-1");
    expect(calls[0]?.url).not.toContain(SECRET);
  });

  it("rend les deux jetons et leur durée", async () => {
    const { client } = setup(() => text(GRANT));
    expect(await client.exchangeCode("CODE-1")).toEqual({
      ok: true,
      value: { accessToken: "ACCESS-X", refreshToken: "REFRESH-X", expiresIn: 14_400 },
    });
  });

  it("est refusé (sans nouvel essai possible) quand Twitch dit non, avec sa raison courte et sans le code", async () => {
    const { client } = setup(() => text('{ "status": 400, "message": "Invalid authorization code" }', 400));
    const result = await client.exchangeCode("CODE-1");
    expect(result).toEqual({ ok: false, isRefused: true, message: "HTTP 400 : Invalid authorization code" });
  });

  it("n'est pas refusé quand Twitch tombe (503) : on pourra réessayer", async () => {
    const { client } = setup(() => text("<html>maintenance</html>", 503));
    expect(await client.exchangeCode("CODE-1")).toEqual({ ok: false, isRefused: false, message: "HTTP 503" });
  });

  it("n'est pas refusé quand le réseau tombe, et ne dit que la panne", async () => {
    const client = createTwitchAuthClient({
      clientId: "mon-client",
      clientSecret: SECRET,
      fetcher: (async () => {
        throw new Error("fetch failed");
      }) as typeof fetch,
    });
    expect(await client.exchangeCode("CODE-1")).toEqual({
      ok: false,
      isRefused: false,
      message: "fetch failed",
    });
  });

  it("dit « illisible » pour une réponse sans jeton, sans rien dire de son contenu", async () => {
    const { client } = setup(() => text('{ "access_token": 12 }'));
    expect(await client.exchangeCode("CODE-1")).toEqual({
      ok: false,
      isRefused: false,
      message: "jeton illisible",
    });
    const html = setup(() => text("<html>erreur</html>"));
    expect(await html.client.exchangeCode("CODE-1")).toEqual({
      ok: false,
      isRefused: false,
      message: "jeton illisible",
    });
  });

  it("borne l'attente par un délai", async () => {
    const { client, calls } = setup(() => text(GRANT));
    await client.exchangeCode("CODE-1");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("refresh : un autre jeton d'accès", () => {
  it("POST sur /oauth2/token avec le jeton de renouvellement", async () => {
    const { client, calls } = setup(() => text(GRANT));
    const result = await client.refresh("REFRESH-OLD");
    const form = formOf(calls[0]);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("REFRESH-OLD");
    expect(form.get("client_id")).toBe("mon-client");
    expect(form.get("client_secret")).toBe(SECRET);
    expect(result).toMatchObject({ ok: true, value: { accessToken: "ACCESS-X", refreshToken: "REFRESH-X" } });
  });

  it("est refusé quand le jeton de renouvellement n'est plus bon (400)", async () => {
    const { client } = setup(() => text('{ "status": 400, "message": "Invalid refresh token" }', 400));
    expect(await client.refresh("REFRESH-OLD")).toEqual({
      ok: false,
      isRefused: true,
      message: "HTTP 400 : Invalid refresh token",
    });
  });

  it("n'est pas refusé quand Twitch limite les appels (429) ou ne répond pas à temps (408)", async () => {
    const limited = setup(() => text("{}", 429));
    expect(await limited.client.refresh("R")).toMatchObject({ ok: false, isRefused: false });
    const late = setup(() => text("{}", 408));
    expect(await late.client.refresh("R")).toMatchObject({ ok: false, isRefused: false });
  });

  it("coupe une raison trop longue", async () => {
    const long = "x".repeat(400);
    const { client } = setup(() => text(`{ "message": "${long}" }`, 400));
    const result = await client.refresh("R");
    expect(result.ok ? "" : result.message.length).toBeLessThan(100);
  });
});

describe("getIdentity : le compte derrière un jeton", () => {
  it("GET sur /oauth2/validate avec le jeton en en-tête OAuth, jamais dans l'adresse", async () => {
    const { client, calls } = setup(() => text(IDENTITY));
    await client.getIdentity("ACCESS-X");
    expect(calls[0]?.url).toBe("https://id.twitch.tv/oauth2/validate");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("OAuth ACCESS-X");
    expect(calls[0]?.url).not.toContain("ACCESS-X");
  });

  it("rend le compte, son identifiant et ses droits, séparés par des espaces", async () => {
    const { client } = setup(() => text(IDENTITY));
    expect(await client.getIdentity("ACCESS-X")).toEqual({
      ok: true,
      value: { login: "fenysk", userId: "68710381", scope: "moderator:read:followers" },
    });
  });

  it("est refusé quand le jeton n'est plus valable (401)", async () => {
    const { client } = setup(() => text('{ "status": 401, "message": "invalid access token" }', 401));
    expect(await client.getIdentity("ACCESS-X")).toEqual({
      ok: false,
      isRefused: true,
      message: "HTTP 401 : invalid access token",
    });
  });

  it("dit « illisible » sans compte dans la réponse", async () => {
    const { client } = setup(() => text('{ "scopes": [] }'));
    expect(await client.getIdentity("ACCESS-X")).toEqual({
      ok: false,
      isRefused: false,
      message: "compte illisible",
    });
  });
});

describe("revoke : retirer le jeton chez Twitch", () => {
  it("POST sur /oauth2/revoke avec l'identifiant de l'application et le jeton, sans le secret", async () => {
    const { client, calls } = setup(() => text("", 200));
    expect(await client.revoke("ACCESS-X")).toEqual({ ok: true, value: null });
    expect(calls[0]?.url).toBe("https://id.twitch.tv/oauth2/revoke");
    const form = formOf(calls[0]);
    expect(form.get("client_id")).toBe("mon-client");
    expect(form.get("token")).toBe("ACCESS-X");
    expect(form.has("client_secret")).toBe(false);
  });

  it("dit l'échec sans le jeton", async () => {
    const { client } = setup(() => text('{ "message": "Invalid token" }', 400));
    const result = await client.revoke("ACCESS-X");
    expect(result).toEqual({ ok: false, isRefused: true, message: "HTTP 400 : Invalid token" });
  });
});

describe("l'adresse de Twitch est réglable", () => {
  it("parle à l'adresse donnée (un faux Twitch local) au lieu de id.twitch.tv", async () => {
    const calls: Call[] = [];
    const client = createTwitchAuthClient({
      clientId: "mon-client",
      clientSecret: SECRET,
      idUrl: "http://127.0.0.1:9999",
      fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return text(GRANT);
      }) as typeof fetch,
    });
    await client.exchangeCode("CODE-1");
    expect(calls[0]?.url).toBe("http://127.0.0.1:9999/oauth2/token");
  });
});
