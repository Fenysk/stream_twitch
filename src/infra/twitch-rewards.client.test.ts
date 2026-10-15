import { describe, expect, it } from "vitest";
import { createRewardsClient } from "./twitch-rewards.client";

type Sent = { url: URL; method: string; headers: Headers; body: string | undefined };

const json = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

// Un faux Twitch : chaque appel est noté, la réponse est celle que le test pose.
const setup = (
  options: {
    respond?: (sent: Sent) => Response | Promise<Response>;
    tokenFor?: (isForced: boolean) => string | null;
    broadcasterId?: string | undefined;
  } = {},
) => {
  const requests: Sent[] = [];
  const wasForced: boolean[] = [];
  const client = createRewardsClient({
    clientId: "mon-client",
    broadcasterId: "broadcasterId" in options ? options.broadcasterId : "68710381",
    getAccessToken: async (isForced) => {
      wasForced.push(isForced);
      return options.tokenFor ? options.tokenFor(isForced) : "ACCESS-X";
    },
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      const sent: Sent = {
        url: new URL(String(url)),
        method: String(init?.method),
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined,
      };
      requests.push(sent);
      return options.respond ? options.respond(sent) : json('{"data":[]}');
    }) as typeof fetch,
  });
  return { client, requests, wasForced };
};

describe("create : un reward qui ne saute pas la file de Twitch", () => {
  it("poste le titre, le coût et le cooldown pour la chaîne, avec le jeton et le client-id, et rend l'identifiant", async () => {
    const { client, requests } = setup({
      respond: () => json('{"data":[{"id":"reward-abc","title":"Rire"}]}'),
    });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result).toEqual({ ok: true, value: "reward-abc" });
    const [sent] = requests;
    expect(sent?.method).toBe("POST");
    expect(`${sent?.url.origin}${sent?.url.pathname}`).toBe(
      "https://api.twitch.tv/helix/channel_points/custom_rewards",
    );
    expect(sent?.url.searchParams.get("broadcaster_id")).toBe("68710381");
    expect(sent?.headers.get("authorization")).toBe("Bearer ACCESS-X");
    expect(sent?.headers.get("client-id")).toBe("mon-client");
    expect(sent?.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(sent?.body ?? "{}")).toEqual(
      JSON.parse(
        '{"title":"Rire","cost":100,"is_global_cooldown_enabled":true,"global_cooldown_seconds":30,"should_redemptions_skip_request_queue":false}',
      ),
    );
  });

  it("dit une réponse sans identifiant illisible", async () => {
    const { client } = setup({ respond: () => json('{"data":[]}') });
    expect(await client.create({ title: "Rire", cost: 100, pace: 0 })).toEqual({
      ok: false,
      status: 502,
      message: "réponse de Twitch illisible",
    });
  });
});

describe("update, delete : modifier et retirer un reward", () => {
  it("modifie le reward par son identifiant, avec les seuls champs changés", async () => {
    const { client, requests } = setup();
    expect(await client.update("reward-abc", { cost: 250 })).toEqual({ ok: true, value: null });
    const [sent] = requests;
    expect(sent?.method).toBe("PATCH");
    expect(sent?.url.pathname).toBe("/helix/channel_points/custom_rewards");
    expect(sent?.url.searchParams.get("id")).toBe("reward-abc");
    expect(JSON.parse(sent?.body ?? "{}")).toEqual({ cost: 250 });
  });

  it("met un reward en pause, ou le remet en route", async () => {
    const { client, requests } = setup();
    await client.update("reward-abc", { isPaused: true });
    await client.update("reward-abc", { isPaused: false });
    expect(requests.map(({ body }) => body)).toEqual(['{"is_paused":true}', '{"is_paused":false}']);
  });

  it("supprime le reward par son identifiant, sans corps, et lit un 204 vide", async () => {
    const { client, requests } = setup({ respond: () => new Response(null, { status: 204 }) });
    expect(await client.delete("reward-abc")).toEqual({ ok: true, value: null });
    const [sent] = requests;
    expect(sent?.method).toBe("DELETE");
    expect(sent?.url.searchParams.get("id")).toBe("reward-abc");
    expect(sent?.body).toBeUndefined();
    expect(sent?.headers.get("content-type")).toBeNull();
  });
});

describe("list : les rewards de la chaîne, et ceux que l'app peut gérer", () => {
  const all =
    '{"data":[{"id":"mien","title":"Fait par l\'app","cost":100,"global_cooldown_setting":{"is_enabled":true,"global_cooldown_seconds":30}},{"id":"clash","title":"Clasher Fenysk","cost":500,"global_cooldown_setting":{"is_enabled":false,"global_cooldown_seconds":0}},{"id":"sans-titre","cost":1},{"title":"sans id","cost":1}]}';
  const own = '{"data":[{"id":"mien","title":"Fait par l\'app","cost":100}]}';

  it("lit tous les rewards, puis demande à Twitch lesquels l'app peut gérer (only_manageable_rewards=true)", async () => {
    const { client, requests } = setup({
      respond: ({ url }) => json(url.searchParams.get("only_manageable_rewards") === "true" ? own : all),
    });
    const result = await client.list();
    expect(result).toEqual({
      ok: true,
      value: [
        { id: "mien", title: "Fait par l'app", cost: 100, pace: 30, isManageable: true },
        { id: "clash", title: "Clasher Fenysk", cost: 500, pace: 0, isManageable: false },
      ],
    });
    expect(requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
    expect(requests.map(({ url }) => url.searchParams.get("only_manageable_rewards"))).toEqual([
      null,
      "true",
    ]);
    expect(requests.every(({ url }) => url.searchParams.get("broadcaster_id") === "68710381")).toBe(true);
    expect(requests.every(({ url }) => url.pathname === "/helix/channel_points/custom_rewards")).toBe(true);
  });

  it("dit pourquoi Twitch refuse la liste, sans lever", async () => {
    const { client } = setup({
      respond: () => json('{"message":"The broadcaster is not a partner or affiliate"}', 403),
    });
    const result = await client.list();
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(result.ok ? "" : result.message).toContain("n'est pas affiliée");
  });

  it("ne rend rien quand la seconde demande échoue : une liste sans savoir ce qu'on gère serait trompeuse", async () => {
    const { client } = setup({
      respond: ({ url }) =>
        url.searchParams.get("only_manageable_rewards") === "true" ? json("{}", 503) : json(all),
    });
    expect(await client.list()).toMatchObject({ ok: false, status: 503 });
  });

  it("dit que Twitch n'est pas prêt sans jeton, sans rien envoyer", async () => {
    const { client, requests } = setup({ tokenFor: () => null });
    expect(await client.list()).toMatchObject({ ok: false, status: 401 });
    expect(requests).toEqual([]);
  });
});

describe("listPending, settle : les redemptions", () => {
  it("liste les identifiants des redemptions UNFULFILLED d'un reward", async () => {
    const { client, requests } = setup({
      respond: () => json('{"data":[{"id":"red-1","status":"UNFULFILLED"},{"id":"red-2"}]}'),
    });
    expect(await client.listPending("reward-abc")).toEqual({ ok: true, value: ["red-1", "red-2"] });
    const [sent] = requests;
    expect(sent?.method).toBe("GET");
    expect(sent?.url.pathname).toBe("/helix/channel_points/custom_rewards/redemptions");
    expect(sent?.url.searchParams.get("reward_id")).toBe("reward-abc");
    expect(sent?.url.searchParams.get("status")).toBe("UNFULFILLED");
    expect(sent?.url.searchParams.get("first")).toBe("50");
  });

  it("marque une redemption FULFILLED ou CANCELED, avec l'identifiant du reward", async () => {
    const { client, requests } = setup();
    await client.settle({ id: "red-1", rewardId: "reward-abc" }, "FULFILLED");
    await client.settle({ id: "red-2", rewardId: "reward-abc" }, "CANCELED");
    expect(requests.map(({ method, body }) => `${method} ${body}`)).toEqual([
      'PATCH {"status":"FULFILLED"}',
      'PATCH {"status":"CANCELED"}',
    ]);
    const [sent] = requests;
    expect(sent?.url.pathname).toBe("/helix/channel_points/custom_rewards/redemptions");
    expect(sent?.url.searchParams.get("id")).toBe("red-1");
    expect(sent?.url.searchParams.get("reward_id")).toBe("reward-abc");
    expect(sent?.url.searchParams.get("broadcaster_id")).toBe("68710381");
  });
});

describe("les refus de Twitch, dits en français", () => {
  it("dit une chaîne non affiliée (403)", async () => {
    const { client } = setup({
      respond: () => json('{"status":403,"message":"The broadcaster is not a partner or affiliate"}', 403),
    });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(result.ok ? "" : result.message).toContain("n'est pas affiliée");
  });

  it("dit un titre déjà pris (400)", async () => {
    const { client } = setup({
      respond: () => json('{"status":400,"message":"CREATE_CUSTOM_REWARD_DUPLICATE_REWARD"}', 400),
    });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result.ok ? "" : result.message).toBe(
      "Twitch refuse ce titre : une récompense de la chaîne le porte déjà.",
    );
  });

  it("dit les 50 récompenses atteintes (400)", async () => {
    const { client } = setup({
      respond: () => json('{"status":400,"message":"CREATE_CUSTOM_REWARD_TOO_MANY_REWARDS"}', 400),
    });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result.ok ? "" : result.message).toContain("50 récompenses");
  });

  it("rend le 404 tel quel : l'appelant sait que Twitch ne connaît plus le reward", async () => {
    const { client } = setup({ respond: () => json("{}", 404) });
    expect(await client.update("reward-abc", { cost: 1 })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("le jeton et le réseau", () => {
  it("redemande un jeton forcé quand Twitch dit 401, et réessaie une fois avec lui", async () => {
    const { client, requests, wasForced } = setup({
      respond: ({ headers }) =>
        headers.get("authorization") === "Bearer ACCESS-2" ? json('{"data":[{"id":"r"}]}') : json("{}", 401),
      tokenFor: (isForced) => (isForced ? "ACCESS-2" : "ACCESS-1"),
    });
    expect(await client.create({ title: "Rire", cost: 100, pace: 30 })).toEqual({ ok: true, value: "r" });
    expect(wasForced).toEqual([false, true]);
    expect(requests).toHaveLength(2);
  });

  it("dit que Twitch n'est pas prêt quand il n'y a pas de jeton, sans rien envoyer", async () => {
    const { client, requests } = setup({ tokenFor: () => null });
    expect(await client.delete("reward-abc")).toEqual({
      ok: false,
      status: 401,
      message: "Twitch n'est pas prêt : connecte-toi (ou reconnecte-toi) depuis l'onglet Renard.",
    });
    expect(requests).toEqual([]);
  });

  it("dit que l'identifiant de la chaîne manque, sans rien envoyer", async () => {
    const { client, requests } = setup({ broadcasterId: undefined });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result).toMatchObject({ ok: false, status: 0 });
    expect(result.ok ? "" : result.message).toContain("chatChannelId");
    expect(requests).toEqual([]);
  });

  it("dit que Twitch ne répond pas quand le réseau tombe, sans lever", async () => {
    const { client } = setup({
      respond: () => {
        throw new Error("connexion coupée");
      },
    });
    expect(await client.update("reward-abc", { cost: 1 })).toEqual({
      ok: false,
      status: 0,
      message: "Twitch ne répond pas (connexion coupée).",
    });
  });

  it("n'écrit jamais le jeton dans un message d'erreur", async () => {
    const { client } = setup({ respond: () => json('{"message":"Invalid OAuth token"}', 400) });
    const result = await client.create({ title: "Rire", cost: 100, pace: 30 });
    expect(result.ok ? "" : result.message).not.toContain("ACCESS-X");
  });
});
