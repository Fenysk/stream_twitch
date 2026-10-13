import { describe, expect, it } from "vitest";
import { EMOTE_PROVIDERS, EMOTE_SCOPES } from "../domain/emote-sync.rules";
import { createEmoteClient } from "./emotes.client";

type Call = { url: string; init: RequestInit | undefined };

// Un faux réseau : il note chaque appel et rend la réponse prévue. Les tests n'appellent jamais le vrai.
const setup = (
  respond: (url: string) => Response | Error,
  options: { channelId?: string | undefined } = {},
) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const answer = respond(String(url));
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  const client = createEmoteClient({
    channelId: "channelId" in options ? options.channelId : "68710381",
    login: "Fenysk",
    fetcher,
  });
  return { client, calls };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createEmoteClient : les adresses", () => {
  it("appelle les emotes globales des trois services", async () => {
    const { client, calls } = setup(() => json({}));
    for (const provider of EMOTE_PROVIDERS) await client.get(provider, "global");
    expect(calls.map(({ url }) => url)).toEqual([
      "https://7tv.io/v3/emote-sets/global",
      "https://api.betterttv.net/3/cached/emotes/global",
      "https://api.frankerfacez.com/v1/set/global",
    ]);
  });

  it("appelle les emotes de la chaîne : l'identifiant Twitch pour 7TV et BTTV, le nom en minuscules pour FFZ", async () => {
    const { client, calls } = setup(() => json({}));
    for (const provider of EMOTE_PROVIDERS) await client.get(provider, "channel");
    expect(calls.map(({ url }) => url)).toEqual([
      "https://7tv.io/v3/users/twitch/68710381",
      "https://api.betterttv.net/3/cached/users/twitch/68710381",
      "https://api.frankerfacez.com/v1/room/fenysk",
    ]);
  });

  it("n'appelle pas 7TV ni BTTV pour la chaîne sans identifiant : rien à donner, FFZ marche par le nom", async () => {
    const { client, calls } = setup(() => json({}), { channelId: undefined });
    expect(await client.get("7tv", "channel")).toEqual({ kind: "missing" });
    expect(await client.get("bttv", "channel")).toEqual({ kind: "missing" });
    expect(calls).toEqual([]);
    await client.get("ffz", "channel");
    expect(calls).toHaveLength(1);
  });

  it("n'envoie dans l'adresse que l'identifiant et le nom encodés", async () => {
    const calls: string[] = [];
    const client = createEmoteClient({
      channelId: "1/../2",
      login: "a b/c",
      fetcher: (async (url: string | URL | Request) => {
        calls.push(String(url));
        return json({});
      }) as typeof fetch,
    });
    await client.get("7tv", "channel");
    await client.get("ffz", "channel");
    expect(calls).toEqual([
      "https://7tv.io/v3/users/twitch/1%2F..%2F2",
      "https://api.frankerfacez.com/v1/room/a%20b%2Fc",
    ]);
  });
});

describe("createEmoteClient : les réponses", () => {
  it("rend le JSON d'une réponse 200", async () => {
    const { client } = setup(() => json({ emotes: [{ name: "EZ" }] }));
    expect(await client.get("7tv", "global")).toEqual({ kind: "found", json: { emotes: [{ name: "EZ" }] } });
  });

  it("tient un 404 pour « aucune emote », pas pour une erreur, sur chaque service et chaque liste", async () => {
    const { client } = setup(() => json({ status: "Not Found", message: "Not Found" }, 404));
    for (const provider of EMOTE_PROVIDERS) {
      for (const scope of EMOTE_SCOPES) {
        expect(await client.get(provider, scope), `${provider} ${scope}`).toEqual({ kind: "missing" });
      }
    }
  });

  it("lève sur tout autre code HTTP : 500, 503, 429", async () => {
    for (const status of [500, 503, 429]) {
      const { client } = setup(() => json({}, status));
      await expect(client.get("bttv", "global")).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it("lève quand le réseau tombe ou quand le délai est dépassé", async () => {
    const { client } = setup(() => new Error("fetch failed"));
    await expect(client.get("ffz", "global")).rejects.toThrow("fetch failed");
  });

  it("lève quand le corps n'est pas du JSON", async () => {
    const { client } = setup(() => new Response("<html>maintenance</html>", { status: 200 }));
    await expect(client.get("7tv", "global")).rejects.toThrow();
  });

  it("demande du JSON et borne l'attente par un délai", async () => {
    const { client, calls } = setup(() => json({}));
    await client.get("7tv", "global");
    expect(new Headers(calls[0]?.init?.headers).get("accept")).toBe("application/json");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
