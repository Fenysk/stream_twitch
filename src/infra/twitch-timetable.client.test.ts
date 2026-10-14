import { describe, expect, it } from "vitest";
import { createTimetableClient } from "./twitch-timetable.client";

const SECRET = "le-secret-de-l-app";
const TOKEN = "jeton-d-application";

type Call = { url: string; init: RequestInit | undefined };

const json = (body: string, status = 200): Response => new Response(body, { status });
const TOKEN_BODY = `{ "access_token": "${TOKEN}", "expires_in": 3600, "token_type": "bearer" }`;

const entry = (start: string, title: string | null, canceledUntil: string | null = null): string =>
  `{ "id": "x", "start_time": "${start}", "end_time": "2026-10-16T23:00:00Z", "title": ${JSON.stringify(title)}, "canceled_until": ${JSON.stringify(canceledUntil)}, "category": null, "is_recurring": true }`;

const schedule = (segments: string[], vacation = "null"): string =>
  `{ "data": { "segments": [${segments.join(",")}], "broadcaster_id": "68710381", "broadcaster_name": "Fenysk", "broadcaster_login": "fenysk", "vacation": ${vacation} }, "pagination": {} }`;

const ONE_SLOT = schedule([entry("2026-10-16T18:00:00Z", "Soirée jeux")]);

// Un faux Twitch : il note chaque appel et répond selon l'adresse. Les tests n'appellent jamais le vrai.
const setup = (
  handlers: { token?: () => Response; schedule?: () => Response } = {},
  options: { channelId?: string | undefined } = {},
) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://id.twitch.tv/oauth2/token"))
      return handlers.token?.() ?? json(TOKEN_BODY);
    return handlers.schedule?.() ?? json(ONE_SLOT);
  }) as typeof fetch;
  const port = createTimetableClient({
    clientId: "mon-client",
    clientSecret: SECRET,
    channelId: "channelId" in options ? options.channelId : "68710381",
    fetcher,
    clock: () => 1_000_000,
  });
  return { port, calls };
};

describe("createTimetableClient : la timetable par l'API Helix", () => {
  it("demande un jeton d'application, puis la timetable de la chaîne, et rend ses créneaux", async () => {
    const { port, calls } = setup();
    expect(await port.get()).toEqual([{ start: Date.parse("2026-10-16T18:00:00Z"), title: "Soirée jeux" }]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://id.twitch.tv/oauth2/token");
    expect(calls[1]?.url).toBe("https://api.twitch.tv/helix/schedule?broadcaster_id=68710381");
    const headers = new Headers(calls[1]?.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("client-id")).toBe("mon-client");
  });

  it("n'écrit jamais le secret dans une adresse", async () => {
    const { port, calls } = setup();
    await port.get();
    for (const { url } of calls) expect(url).not.toContain(SECRET);
  });

  it("garde le jeton d'application : la deuxième demande ne le redemande pas", async () => {
    const { port, calls } = setup();
    await port.get();
    await port.get();
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(1);
    expect(calls.filter(({ url }) => url.includes("helix/schedule"))).toHaveLength(2);
  });

  it("rend aucun créneau pour une chaîne sans timetable (404), sans erreur", async () => {
    const { port } = setup({
      schedule: () => json('{ "error": "Not Found", "status": 404, "message": "no schedule" }', 404),
    });
    expect(await port.get()).toEqual([]);
  });

  it("ne rend pas un créneau annulé", async () => {
    const { port } = setup({
      schedule: () =>
        json(
          schedule([
            entry("2026-10-16T18:00:00Z", "Annulé", "2026-10-16T23:00:00Z"),
            entry("2026-10-23T18:00:00Z", "Gardé"),
          ]),
        ),
    });
    expect((await port.get()).map(({ title }) => title)).toEqual(["Gardé"]);
  });

  it("ne rend pas un créneau pendant les vacances", async () => {
    const { port } = setup({
      schedule: () =>
        json(
          schedule(
            [entry("2026-10-16T18:00:00Z", "En vacances"), entry("2026-10-30T18:00:00Z", "Après")],
            '{ "start_time": "2026-10-15T00:00:00Z", "end_time": "2026-10-20T00:00:00Z" }',
          ),
        ),
    });
    expect((await port.get()).map(({ title }) => title)).toEqual(["Après"]);
  });

  it("nettoie le titre, et rend null quand il n'y en a pas", async () => {
    const { port } = setup({
      schedule: () =>
        json(schedule([entry("2026-10-16T18:00:00Z", "Soirée !  "), entry("2026-10-17T18:00:00Z", "")])),
    });
    expect((await port.get()).map(({ title }) => title)).toEqual(["Soirée", null]);
  });

  it("rend aucun créneau quand la timetable existe sans segment", async () => {
    const { port } = setup({
      schedule: () => json('{ "data": { "segments": null, "vacation": null }, "pagination": {} }'),
    });
    expect(await port.get()).toEqual([]);
  });

  it("ignore un créneau dont la date est illisible", async () => {
    const { port } = setup({
      schedule: () => json(schedule([entry("pas une date", "Cassé"), entry("2026-10-16T18:00:00Z", "Bon")])),
    });
    expect((await port.get()).map(({ title }) => title)).toEqual(["Bon"]);
  });

  it("redemande un jeton une fois quand Twitch répond 401", async () => {
    let answers = 0;
    const { port, calls } = setup({
      schedule: () => {
        answers += 1;
        return answers === 1 ? json("{}", 401) : json(ONE_SLOT);
      },
    });
    expect(await port.get()).toHaveLength(1);
    expect(calls.filter(({ url }) => url.includes("oauth2/token"))).toHaveLength(2);
  });

  it("lève une erreur lisible, sans jeton ni secret, quand Twitch répond mal", async () => {
    const failing = setup({ schedule: () => json("{}", 500) });
    await expect(failing.port.get()).rejects.toThrow("HTTP 500");
    const refused = setup({ token: () => json("{}", 403) });
    await expect(refused.port.get()).rejects.toThrow("jeton d'application refusé (HTTP 403)");
    const unreadable = setup({ schedule: () => json("pas du json") });
    await expect(unreadable.port.get()).rejects.toThrow("réponse illisible");
    const wrongBody = setup({ schedule: () => json('{ "data": { "segments": "non" } }') });
    await expect(wrongBody.port.get()).rejects.toThrow("réponse illisible");
    for (const { port } of [failing, refused, unreadable]) {
      await port.get().catch((error: Error) => {
        expect(error.message).not.toContain(SECRET);
        expect(error.message).not.toContain(TOKEN);
      });
    }
  });

  it("ne demande rien sans identifiant de chaîne", async () => {
    const { port, calls } = setup({}, { channelId: undefined });
    expect(await port.get()).toEqual([]);
    expect(calls).toEqual([]);
  });
});
