import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PictureState } from "../../src/domain/picture.schema";
import { PictureFeed, type PictureSnapshot } from "./picture-feed";
import type { FetchFn, FetchInit } from "./server-request";
import { RECONNECT_MS } from "./sse-follower";

const BASE = "http://127.0.0.1:4747";
const EVENTS_URL = `${BASE}/api/obs/picture/events`;

const PC: PictureState = {
  members: [
    { id: "pc", label: "PC", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isAvailable: true },
    { id: "head", label: "Tête", isAvailable: true },
  ],
  currentId: "pc",
};
const CAMERA: PictureState = { ...PC, currentId: "camera-1" };

const frame = (picture: unknown): string => `data: ${JSON.stringify(picture)}\n\n`;

// Un flux d'essai : ce que le serveur y écrit (`push`), sa fin (`end`, `fail`) et ses ouvertures. Comme un vrai `fetch`, l'abandon du
// signal coupe la lecture.
const createStreamRoute = () => {
  const opened: AbortSignal[] = [];
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let isOpen = false;
  const open = ({ signal }: FetchInit): Response => {
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
    open,
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

// Laisse passer les chaînes de promesses (lecture du flux) sans avancer l'horloge.
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 6; turn += 1) await vi.advanceTimersByTimeAsync(0);
};

const readyPicture = (snapshot: PictureSnapshot) =>
  snapshot.status === "ready" ? snapshot.picture : undefined;

describe("PictureFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Un plugin qui lit le flux de l'image d'un serveur d'essai, et le journal.
  const setup = (answer?: (init: FetchInit) => Response | Promise<Response>) => {
    const stream = createStreamRoute();
    const urls: string[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      urls.push(url);
      return answer ? answer(init) : stream.open(init);
    };
    const logs: string[] = [];
    const feed = new PictureFeed(BASE, fetchFn, (message) => logs.push(message));
    return { feed, stream, urls, logs };
  };

  it("ne sait rien tant que le flux n'a pas parlé", async () => {
    const { feed } = setup();
    expect(feed.snapshot).toEqual({ status: "pending" });
    feed.show("a");
    await settle();
    expect(feed.snapshot).toEqual({ status: "pending" });
  });

  it("ouvre le flux de l'image avec la première touche visible, un seul pour toutes", async () => {
    const { feed, stream, urls } = setup();
    feed.show("a");
    feed.show("b");
    feed.show("c");
    await settle();
    expect(stream.opened).toHaveLength(1);
    expect(urls).toEqual([EVENTS_URL]);
  });

  it("Quand le serveur envoie l'image, le système doit la montrer aux touches tout de suite, puis chaque changement dans l'ordre", async () => {
    const { feed, stream } = setup();
    const heard: (string | null | undefined)[] = [];
    feed.onUpdate((snapshot) => heard.push(readyPicture(snapshot)?.currentId));
    feed.show("a");
    await settle();
    stream.push(frame(PC));
    stream.push(frame(CAMERA));
    stream.push(frame(PC));
    await settle();
    expect(heard).toEqual(["pc", "camera-1", "pc"]);
    expect(readyPicture(feed.snapshot)).toEqual(PC);
  });

  it("lit une image coupée en plusieurs morceaux, et plusieurs images arrivées ensemble", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    const text = frame(CAMERA);
    stream.push(text.slice(0, 25));
    await settle();
    expect(feed.snapshot.status).toBe("pending");
    stream.push(`${text.slice(25)}${frame(PC)}`);
    await settle();
    expect(readyPicture(feed.snapshot)?.currentId).toBe("pc");
  });

  it("ne tient pas compte du keepalive ni des commentaires : le serveur les envoie pour garder le flux ouvert", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    stream.push(frame(PC));
    await settle();
    const heard: PictureSnapshot[] = [];
    feed.onUpdate((snapshot) => heard.push(snapshot));
    stream.push("event: keepalive\ndata: null\n\n: un commentaire\n\nretry: 1000\n\n");
    await settle();
    expect(heard).toEqual([]);
    expect(readyPicture(feed.snapshot)).toEqual(PC);
  });

  it("écarte ce que le plugin ne connaît pas : un champ d'un serveur plus récent n'est pas une erreur", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    stream.push(
      frame({
        members: [{ id: "pc", label: "PC", isAvailable: true, brandNew: 1 }],
        currentId: "pc",
        brandNew: 2,
      }),
    );
    await settle();
    expect(readyPicture(feed.snapshot)).toEqual({
      members: [{ id: "pc", label: "PC", isAvailable: true }],
      currentId: "pc",
    });
  });

  it("dit que le serveur est à relancer quand l'image du flux n'est pas du JSON ou d'un autre type, et le dit une fois au journal par message illisible", async () => {
    const { feed, stream, logs } = setup();
    feed.show("a");
    await settle();
    stream.push(frame({ members: "beaucoup" }));
    await settle();
    expect(feed.snapshot.status).toBe("to-restart");
    stream.push(frame(PC));
    await settle();
    expect(feed.snapshot.status).toBe("ready");
    stream.push("data: pas du json\n\n");
    await settle();
    expect(feed.snapshot.status).toBe("to-restart");
    expect(logs.some((line) => line.startsWith("Flux de l'image : message illisible"))).toBe(true);
  });

  it("dit que le serveur est éteint dès la coupure du flux, une seule fois, et le dit au journal", async () => {
    const { feed, stream, logs } = setup();
    const heard: string[] = [];
    feed.onUpdate((snapshot) => heard.push(snapshot.status));
    feed.show("a");
    await settle();
    stream.push(frame(PC));
    await settle();
    stream.fail(new TypeError("terminated"));
    await settle();
    expect(feed.snapshot.status).toBe("down");
    expect(heard).toEqual(["ready", "down"]);
    expect(logs).toEqual([
      "Flux de l'image ouvert.",
      expect.stringContaining("Flux de l'image coupé (terminated)"),
    ]);
  });

  it("se rouvre seul 2 s après la coupure, et reprend alors l'image du flux", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    stream.end();
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS - 1);
    expect(stream.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(stream.opened).toHaveLength(2);
    stream.push(frame(CAMERA));
    await settle();
    expect(readyPicture(feed.snapshot)?.currentId).toBe("camera-1");
  });

  it("dit que le serveur est éteint quand il ne répond pas du tout, sans le redire à chaque essai, et reprend quand il revient", async () => {
    const stream = createStreamRoute();
    let isUp = false;
    const { feed } = setup((init) => {
      if (!isUp) throw new TypeError("connexion refusée");
      return stream.open(init);
    });
    const heard: string[] = [];
    feed.onUpdate((snapshot) => heard.push(snapshot.status));
    feed.show("a");
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    expect(heard).toEqual(["down"]);
    isUp = true;
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    await settle();
    stream.push(frame(PC));
    await settle();
    expect(heard).toEqual(["down", "ready"]);
  });

  it("dit que le serveur est à relancer quand il n'a pas encore la route (404), sans le redire à chaque essai", async () => {
    const calls: string[] = [];
    const { feed } = setup((init) => {
      calls.push(String(init.signal.aborted));
      return new Response(JSON.stringify({ error: "inconnu" }), { status: 404 });
    });
    const heard: string[] = [];
    feed.onUpdate((snapshot) => heard.push(snapshot.status));
    feed.show("a");
    await settle();
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    expect(calls).toHaveLength(3);
    expect(heard).toEqual(["to-restart"]);
  });

  it("abandonne un serveur qui accepte la connexion sans répondre au bout de 3 s, puis réessaie", async () => {
    const signals: AbortSignal[] = [];
    const { feed } = setup(
      ({ signal }) =>
        new Promise<Response>((_, reject) => {
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    feed.show("a");
    await settle();
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(RECONNECT_MS);
    expect(signals).toHaveLength(2);
  });

  it("ferme le flux avec la dernière touche cachée, sans le rouvrir ensuite, et repart de zéro", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    feed.show("b");
    await settle();
    stream.push(frame(PC));
    await settle();
    feed.hide("a");
    expect(stream.opened[0]?.aborted).toBe(false);
    expect(feed.snapshot.status).toBe("ready");
    feed.hide("b");
    expect(stream.opened[0]?.aborted).toBe(true);
    expect(feed.snapshot).toEqual({ status: "pending" });
    await vi.advanceTimersByTimeAsync(RECONNECT_MS * 5);
    expect(stream.opened).toHaveLength(1);
  });

  it("ouvre un flux neuf quand une touche redevient visible", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    feed.hide("a");
    feed.show("a");
    await settle();
    expect(stream.opened).toHaveLength(2);
    stream.push(frame(CAMERA));
    await settle();
    expect(readyPicture(feed.snapshot)?.currentId).toBe("camera-1");
  });

  it("ne rouvre pas le flux d'une touche cachée pendant l'attente de la reconnexion", async () => {
    const { feed, stream } = setup();
    feed.show("a");
    await settle();
    stream.end();
    await settle();
    feed.hide("a");
    await vi.advanceTimersByTimeAsync(RECONNECT_MS * 3);
    expect(stream.opened).toHaveLength(1);
  });
});
