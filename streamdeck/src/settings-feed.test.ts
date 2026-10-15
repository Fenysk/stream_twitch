import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchFn, FetchInit } from "./server-request";
import { type FeedSnapshot, REFRESH_PERIOD_MS, SettingsFeed } from "./settings-feed";

const BASE = "http://127.0.0.1:4747";

type Route = (init: FetchInit) => Response | Promise<Response>;

// Un serveur d'essai : une route par « MÉTHODE /chemin », et la liste de ce qui lui a été demandé.
const serverOf = (routes: Record<string, Route>) => {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const key = `${init.method ?? "GET"} ${url.slice(BASE.length)}`;
    calls.push(key);
    if (init.body !== undefined) bodies.push(JSON.parse(init.body));
    const route = routes[key];
    if (!route) throw new TypeError(`route inconnue : ${key}`);
    return route(init);
  };
  return { fetchFn, calls, bodies };
};

const viewOf = (effective: Record<string, unknown>) => ({
  defaults: { threshold: -40 },
  local: {},
  effective: { threshold: -40, ...effective },
});

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

const EXPRESSIONS = {
  expressions: [
    { id: "photo", name: "Photo", version: "1", isBuiltIn: true },
    { id: "fdef51f3", name: "Content", version: "2", isBuiltIn: false },
  ],
};

const readyView = (snapshot: FeedSnapshot) =>
  snapshot.status === "ready" ? snapshot.view.effective : undefined;

describe("SettingsFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lit les réglages à la première touche visible, une seule fois pour toutes les touches qui arrivent ensemble", async () => {
    const server = serverOf({ "GET /api/settings": () => json(viewOf({ foxShouldThank: false })) });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    feed.show("b", false);
    feed.show("c", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toEqual(["GET /api/settings"]);
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
  });

  it("relit toutes les 10 s tant qu'une touche est visible, puis s'arrête avec la dernière", async () => {
    const server = serverOf({ "GET /api/settings": () => json(viewOf({})) });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    feed.show("b", false);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(server.calls).toHaveLength(3);
    feed.hide("a");
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(server.calls).toHaveLength(4);
    feed.hide("b");
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS * 3);
    expect(server.calls).toHaveLength(4);
  });

  it("montre le changement fait sur la page des réglages à la lecture suivante", async () => {
    let effective: Record<string, unknown> = { foxShouldThank: true };
    const server = serverOf({ "GET /api/settings": () => json(viewOf(effective)) });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
    effective = { foxShouldThank: false };
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
  });

  it("prévient ceux qui écoutent à chaque lecture", async () => {
    const server = serverOf({ "GET /api/settings": () => json(viewOf({})) });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    const statuses: string[] = [];
    feed.onUpdate((snapshot) => statuses.push(snapshot.status));
    feed.show("a", false);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(statuses).toEqual(["ready", "ready"]);
  });

  it("dit down quand le serveur ne répond pas, et to-restart quand sa réponse n'est pas celle attendue", async () => {
    const answers: (() => Response)[] = [
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("Not Found", { status: 404 }),
      () => json({ defaults: 1 }),
      () => json(viewOf({})),
    ];
    const server = serverOf({ "GET /api/settings": () => (answers.shift() ?? (() => json(viewOf({}))))() });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    const seen: string[] = [];
    feed.onUpdate((snapshot) => seen.push(snapshot.status));
    feed.show("a", false);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(seen).toEqual(["down", "to-restart", "to-restart", "ready"]);
  });

  it("ne lit les expressions que si une touche visible en veut", async () => {
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({})),
      "GET /api/expressions": () => json(EXPRESSIONS),
    });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toEqual(["GET /api/settings"]);
    feed.show("b", true);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(server.calls).toContain("GET /api/expressions");
    const snapshot = feed.snapshot;
    expect(snapshot.status === "ready" && snapshot.expressions.map(({ name }) => name)).toEqual([
      "Photo",
      "Content",
    ]);
  });

  it("garde la dernière liste d'expressions quand elle devient illisible", async () => {
    let expressions: Route = () => json(EXPRESSIONS);
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({})),
      "GET /api/expressions": (init) => expressions(init),
    });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", true);
    await vi.advanceTimersByTimeAsync(0);
    expressions = () => new Response("Not Found", { status: 404 });
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    const snapshot = feed.snapshot;
    expect(snapshot.status === "ready" && snapshot.expressions).toHaveLength(2);
  });

  it("lit les expressions à la demande de l'inspecteur, après la lecture déjà en cours qui n'en avait pas", async () => {
    let release: (response: Response) => void = () => undefined;
    let reads = 0;
    const server = serverOf({
      "GET /api/settings": () => {
        reads += 1;
        return reads === 1 ? new Promise<Response>((resolve) => (release = resolve)) : json(viewOf({}));
      },
      "GET /api/expressions": () => json(EXPRESSIONS),
    });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    await vi.advanceTimersByTimeAsync(0);
    const asked = feed.refresh({ withExpressions: true });
    release(json(viewOf({})));
    const snapshot = await asked;
    expect(reads).toBe(2);
    expect(snapshot.status === "ready" && snapshot.expressions).toHaveLength(2);
  });

  describe("change", () => {
    it("écrit en PUT, et la réponse met à jour tout le monde sans relecture de plus", async () => {
      const server = serverOf({
        "GET /api/settings": () => json(viewOf({ foxShouldThank: true })),
        "PUT /api/settings": () => json(viewOf({ foxShouldThank: false })),
      });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      const seen: (boolean | undefined)[] = [];
      feed.onUpdate((snapshot) => seen.push(readyView(snapshot)?.foxShouldThank));
      const result = await feed.change({ foxShouldThank: false });
      expect(result).toEqual({ ok: true });
      expect(server.calls).toEqual(["GET /api/settings", "PUT /api/settings"]);
      expect(server.bodies).toEqual([{ changes: { foxShouldThank: false } }]);
      expect(seen).toEqual([false]);
    });

    it("rend les raisons du refus d'une valeur, sans toucher à ce que les touches montrent", async () => {
      const issues = [{ path: "chatTextSize", message: "doit être d'au plus 120 px" }];
      const server = serverOf({
        "GET /api/settings": () => json(viewOf({ chatTextSize: 20 })),
        "PUT /api/settings": () => json({ issues }, 422),
      });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      const before = feed.snapshot;
      expect(await feed.change({ chatTextSize: 500 })).toEqual({ ok: false, reason: "refused", issues });
      expect(feed.snapshot).toBe(before);
    });

    it("dit que le serveur est éteint à toutes les touches quand l'écriture ne l'atteint pas", async () => {
      let isUp = true;
      const server = serverOf({
        "GET /api/settings": () => json(viewOf({})),
        "PUT /api/settings": () => {
          isUp = false;
          throw new TypeError("fetch failed");
        },
      });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      expect(await feed.change({ foxShouldThank: false })).toEqual({ ok: false, reason: "unavailable" });
      expect(isUp).toBe(false);
      expect(feed.snapshot.status).toBe("down");
    });

    it("dit que le serveur est à relancer quand l'écriture reçoit autre chose qu'une vue des réglages", async () => {
      const server = serverOf({
        "GET /api/settings": () => json(viewOf({})),
        "PUT /api/settings": () => json({ nope: true }),
      });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      expect(await feed.change({ foxShouldThank: false })).toEqual({ ok: false, reason: "unavailable" });
      expect(feed.snapshot.status).toBe("to-restart");
    });
  });

  describe("run", () => {
    it("fait passer les appuis l'un après l'autre, dans l'ordre", async () => {
      const server = serverOf({ "GET /api/settings": () => json(viewOf({})) });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      const order: string[] = [];
      const first = feed.run(async () => {
        order.push("début 1");
        await vi.advanceTimersByTimeAsync(50);
        order.push("fin 1");
      });
      const second = feed.run(async () => {
        order.push("début 2");
      });
      await Promise.all([first, second]);
      expect(order).toEqual(["début 1", "fin 1", "début 2"]);
    });

    it("n'empêche pas l'appui suivant quand le précédent échoue, et rend l'échec à qui l'attend", async () => {
      const feed = new SettingsFeed(BASE, serverOf({}).fetchFn);
      const failing = feed.run(async () => {
        throw new Error("boom");
      });
      const next = feed.run(async () => "suite");
      await expect(failing).rejects.toThrow("boom");
      await expect(next).resolves.toBe("suite");
    });
  });
});
