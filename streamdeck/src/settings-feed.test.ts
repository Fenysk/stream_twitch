import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchFn, FetchInit } from "./server-request";
import { type FeedSnapshot, RECONNECT_MS, REFRESH_PERIOD_MS, SettingsFeed } from "./settings-feed";

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

  describe("réglage que le plugin ne connaît pas (serveur plus récent que lui)", () => {
    // Un réglage ajouté au serveur après la construction du plugin, présent dans les trois parties de la vue.
    const newerView = (effective: Record<string, unknown> = {}) => ({
      defaults: { threshold: -40, brandNewSetting: 1 },
      local: { brandNewSetting: 2 },
      effective: { threshold: -40, foxShouldThank: false, brandNewSetting: 2, ...effective },
    });

    it("lit les réglages connus et laisse celui-là de côté, au lieu de dire que le serveur est à relancer", async () => {
      const server = serverOf({ "GET /api/settings": () => json(newerView()) });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      const snapshot = feed.snapshot;
      expect(snapshot.status).toBe("ready");
      expect(snapshot.status === "ready" && snapshot.view).toEqual({
        defaults: { threshold: -40 },
        local: {},
        effective: { threshold: -40, foxShouldThank: false },
      });
    });

    it("lit de même la réponse d'une écriture", async () => {
      const server = serverOf({
        "GET /api/settings": () => json(viewOf({})),
        "PUT /api/settings": () => json(newerView({ foxShouldThank: true })),
      });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      expect(await feed.change({ foxShouldThank: true })).toEqual({ ok: true });
      expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
    });

    it("refuse toujours un réglage connu d'un autre type, même à côté d'un réglage inconnu", async () => {
      const server = serverOf({ "GET /api/settings": () => json(newerView({ foxShouldThank: "oui" })) });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      expect(feed.snapshot.status).toBe("to-restart");
    });

    it("refuse toujours une vue où manque un réglage connu et obligatoire", async () => {
      const withoutThreshold = { ...newerView(), effective: { foxShouldThank: false, brandNewSetting: 2 } };
      const server = serverOf({ "GET /api/settings": () => json(withoutThreshold) });
      const feed = new SettingsFeed(BASE, server.fetchFn);
      feed.show("a", false);
      await vi.advanceTimersByTimeAsync(0);
      expect(feed.snapshot.status).toBe("to-restart");
    });
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

// Un flux d'essai : ce que le serveur y écrit (`push`), sa fin (`end`, `fail`) et ses ouvertures. Comme un vrai `fetch`, l'abandon du
// signal coupe la lecture.
const createStreamRoute = () => {
  const opened: AbortSignal[] = [];
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  // Un flux fermé ne reçoit plus rien : écrire dedans après coup ne fait rien (le vrai serveur n'a plus personne à qui écrire).
  let isOpen = false;
  const route: Route = ({ signal }) => {
    opened.push(signal);
    const body = new ReadableStream<Uint8Array>({
      start(opening) {
        controller = opening;
        isOpen = true;
        signal.addEventListener("abort", () => {
          isOpen = false;
          opening.error(new DOMException("aborted", "AbortError"));
        });
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  };
  return {
    route,
    opened,
    push: (text: string) => {
      if (isOpen) controller?.enqueue(encoder.encode(text));
    },
    end: () => {
      isOpen = false;
      controller?.close();
    },
    fail: (error: Error) => {
      isOpen = false;
      controller?.error(error);
    },
  };
};

const frame = (view: unknown): string => `data: ${JSON.stringify(view)}\n\n`;

// Laisse passer les chaînes de promesses (lecture du flux, relecture) sans avancer l'horloge.
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 6; turn += 1) await vi.advanceTimersByTimeAsync(0);
};

describe("SettingsFeed : le flux des réglages du serveur", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const EVENTS = "GET /api/settings/events";

  // Un plugin qui lit le flux, un serveur dont on peut couper les réglages, et le journal.
  const setup = (options: { hasStream?: boolean } = {}) => {
    const stream = createStreamRoute();
    const state = { isUp: true, view: viewOf({ foxShouldThank: false }) };
    const server = serverOf({
      "GET /api/settings": () => {
        if (!state.isUp) throw new TypeError("connexion refusée");
        return json(state.view);
      },
      [EVENTS]: stream.route,
      "PUT /api/settings": () => json(viewOf({ foxShouldThank: true })),
    });
    const logs: string[] = [];
    const feed = new SettingsFeed(BASE, server.fetchFn, {
      hasStream: options.hasStream ?? true,
      log: (m) => logs.push(m),
    });
    const reads = () => server.calls.filter((call) => call === "GET /api/settings").length;
    return { stream, server, feed, logs, state, reads };
  };

  it("ouvre le flux avec la première touche visible, un seul pour toutes", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    feed.show("b", false);
    feed.show("c", false);
    await settle();
    expect(stream.opened).toHaveLength(1);
  });

  it("n'ouvre aucun flux quand il n'est pas demandé : seule la relecture de 10 s", async () => {
    const { feed, stream, server } = setup({ hasStream: false });
    feed.show("a", false);
    await settle();
    expect(stream.opened).toHaveLength(0);
    expect(server.calls).toEqual(["GET /api/settings"]);
  });

  it("Quand le serveur envoie un réglage changé, le système doit le montrer aux touches tout de suite, sans attendre les 10 s", async () => {
    const { feed, stream, reads } = setup();
    feed.show("a", false);
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
    expect(reads()).toBe(1);
  });

  it("prévient ceux qui écoutent à chaque vue du flux, dans l'ordre", async () => {
    const { feed, stream } = setup();
    const heard: (boolean | undefined)[] = [];
    feed.onUpdate((snapshot) => heard.push(readyView(snapshot)?.foxShouldThank));
    feed.show("a", false);
    await settle();
    stream.push(frame(viewOf({ foxShouldThank: true })));
    stream.push(frame(viewOf({ foxShouldThank: false })));
    await settle();
    expect(heard).toEqual([false, true, false]);
  });

  it("lit une vue coupée en plusieurs morceaux, et plusieurs vues arrivées ensemble", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    await settle();
    const text = frame(viewOf({ foxShouldThank: true }));
    stream.push(text.slice(0, 20));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
    stream.push(`${text.slice(20)}${frame(viewOf({ foxShouldThank: false }))}`);
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("ne tient pas compte du keepalive ni des commentaires : le serveur les envoie pour garder le flux ouvert", async () => {
    const { feed, stream } = setup();
    const heard: FeedSnapshot[] = [];
    feed.show("a", false);
    await settle();
    feed.onUpdate((snapshot) => heard.push(snapshot));
    stream.push("event: keepalive\ndata: null\n\n: un commentaire\n\nretry: 1000\n\n");
    await settle();
    expect(heard).toEqual([]);
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
  });

  it("garde la relecture de secours toutes les 10 s, flux ouvert ou non", async () => {
    const { feed, reads } = setup();
    feed.show("a", false);
    await settle();
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS);
    expect(reads()).toBe(3);
  });

  it("lit la vue du flux comme celle de GET /api/settings : un réglage que le plugin ne connaît pas est écarté", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    await settle();
    stream.push(
      frame({
        defaults: { threshold: -40, brandNewSetting: 1 },
        local: { brandNewSetting: 2 },
        effective: { threshold: -40, foxShouldThank: true, brandNewSetting: 2 },
      }),
    );
    await settle();
    expect(feed.snapshot.status === "ready" && feed.snapshot.view).toEqual({
      defaults: { threshold: -40 },
      local: {},
      effective: { threshold: -40, foxShouldThank: true },
    });
  });

  it("dit que le serveur est à relancer quand la vue du flux est celle d'un autre type ou n'est pas du JSON", async () => {
    const { feed, stream, logs } = setup();
    feed.show("a", false);
    await settle();
    stream.push(frame(viewOf({ foxShouldThank: "oui" })));
    await settle();
    expect(feed.snapshot.status).toBe("to-restart");
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(feed.snapshot.status).toBe("ready");
    stream.push("data: pas du json\n\n");
    await settle();
    expect(feed.snapshot.status).toBe("to-restart");
    expect(logs.some((line) => line.startsWith("Flux des réglages : message illisible"))).toBe(true);
  });

  it("garde les expressions déjà lues quand le flux change les réglages", async () => {
    const stream = createStreamRoute();
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({})),
      "GET /api/expressions": () => json(EXPRESSIONS),
      [EVENTS]: stream.route,
    });
    const feed = new SettingsFeed(BASE, server.fetchFn, { hasStream: true });
    feed.show("a", true);
    await settle();
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(feed.snapshot.status === "ready" && feed.snapshot.expressions).toEqual(EXPRESSIONS.expressions);
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("Quand le flux se coupe, le système doit relire les réglages tout de suite et le dire au journal", async () => {
    const { feed, stream, reads, logs } = setup();
    feed.show("a", false);
    await settle();
    expect(reads()).toBe(1);
    stream.end();
    await settle();
    expect(reads()).toBe(2);
    expect(logs).toEqual([
      "Flux des réglages ouvert.",
      "Flux des réglages coupé (fermé par le serveur) : relecture, puis nouvel essai dans 2 s.",
    ]);
  });

  it("dit que le serveur est éteint dès la coupure du flux quand il ne répond plus, au lieu d'attendre les 10 s", async () => {
    const { feed, stream, state } = setup();
    feed.show("a", false);
    await settle();
    state.isUp = false;
    stream.fail(new TypeError("terminated"));
    await settle();
    expect(feed.snapshot.status).toBe("down");
  });

  it("se rouvre seul 2 s après la coupure, et reprend alors les vues du flux", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    await settle();
    stream.end();
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS - 1);
    expect(stream.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(stream.opened).toHaveLength(2);
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("réessaie toutes les 2 s sans relire les réglages à chaque essai quand le serveur n'a pas (encore) de flux", async () => {
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({})),
      [EVENTS]: () => json({ error: "inconnu" }, 404),
    });
    const feed = new SettingsFeed(BASE, server.fetchFn, { hasStream: true });
    feed.show("a", false);
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    expect(server.calls.filter((call) => call === EVENTS)).toHaveLength(3);
    expect(server.calls.filter((call) => call === "GET /api/settings")).toHaveLength(1);
  });

  it("réessaie aussi quand le serveur est éteint, et reprend le flux quand il revient", async () => {
    const stream = createStreamRoute();
    let isUp = false;
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({ foxShouldThank: false })),
      [EVENTS]: (init) => {
        if (!isUp) throw new TypeError("connexion refusée");
        return stream.route(init);
      },
    });
    const feed = new SettingsFeed(BASE, server.fetchFn, { hasStream: true });
    feed.show("a", false);
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    isUp = true;
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    await settle();
    expect(stream.opened).toHaveLength(1);
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("abandonne un serveur qui accepte la connexion sans répondre au bout de 3 s, puis réessaie", async () => {
    const signals: AbortSignal[] = [];
    const server = serverOf({
      "GET /api/settings": () => json(viewOf({})),
      [EVENTS]: ({ signal }) => {
        signals.push(signal);
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    });
    const feed = new SettingsFeed(BASE, server.fetchFn, { hasStream: true });
    feed.show("a", false);
    await settle();
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    expect(signals).toHaveLength(2);
  });

  it("garde la vue du flux quand une lecture partie avant elle répond après : la plus récente gagne", async () => {
    const stream = createStreamRoute();
    let release: () => void = () => undefined;
    let isFirst = true;
    const server = serverOf({
      "GET /api/settings": async () => {
        if (!isFirst) return json(viewOf({ foxShouldThank: false }));
        isFirst = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return json(viewOf({ foxShouldThank: false }));
      },
      [EVENTS]: stream.route,
    });
    const feed = new SettingsFeed(BASE, server.fetchFn, { hasStream: true });
    feed.show("a", false);
    await settle();
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
    release();
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("garde de même la réponse d'une écriture quand une lecture partie avant elle répond après", async () => {
    let release: () => void = () => undefined;
    let isFirst = true;
    const server = serverOf({
      "GET /api/settings": async () => {
        if (!isFirst) return json(viewOf({ foxShouldThank: false }));
        isFirst = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return json(viewOf({ foxShouldThank: false }));
      },
      "PUT /api/settings": () => json(viewOf({ foxShouldThank: true })),
    });
    const feed = new SettingsFeed(BASE, server.fetchFn);
    feed.show("a", false);
    await settle();
    expect(await feed.change({ foxShouldThank: true })).toEqual({ ok: true });
    release();
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("ferme le flux avec la dernière touche cachée, sans le rouvrir ensuite", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    feed.show("b", false);
    await settle();
    feed.hide("a");
    expect(stream.opened[0]?.aborted).toBe(false);
    feed.hide("b");
    expect(stream.opened[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(REFRESH_PERIOD_MS + RECONNECT_MS * 3);
    expect(stream.opened).toHaveLength(1);
  });

  it("ouvre un flux neuf quand une touche redevient visible, le premier étant fermé", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    await settle();
    feed.hide("a");
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(false);
    feed.show("a", false);
    await settle();
    expect(stream.opened).toHaveLength(2);
    stream.push(frame(viewOf({ foxShouldThank: true })));
    await settle();
    expect(readyView(feed.snapshot)?.foxShouldThank).toBe(true);
  });

  it("ne rouvre pas le flux d'une touche cachée pendant l'attente de la reconnexion", async () => {
    const { feed, stream } = setup();
    feed.show("a", false);
    await settle();
    stream.end();
    await settle();
    feed.hide("a");
    await vi.advanceTimersByTimeAsync(RECONNECT_MS * 3);
    expect(stream.opened).toHaveLength(1);
  });
});
