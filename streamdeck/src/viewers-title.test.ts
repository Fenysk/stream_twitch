import { afterEach, describe, expect, it, vi } from "vitest";
import { type FetchFn, readViewersTitle } from "./viewers-title";

const VIEWERS_URL = "http://127.0.0.1:4747/api/twitch/viewers";

const answering =
  (body: string, status = 200): FetchFn =>
  async () =>
    new Response(body, { status });

describe("readViewersTitle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("écrit le nombre de viewers quand le serveur répond un live, zéro compris", async () => {
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"live","count":3}'))).toBe("3");
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"live","count":0}'))).toBe("0");
  });

  it("écrit Hors ligne ou ? quand le serveur répond hors ligne ou inconnu", async () => {
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"offline"}'))).toBe("Hors\nligne");
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"unknown"}'))).toBe("?");
  });

  it("demande l'URL reçue, avec un délai de 3 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchFn = vi.fn<FetchFn>(answering('{"kind":"unknown"}'));
    await readViewersTitle(VIEWERS_URL, fetchFn);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(fetchFn).toHaveBeenCalledWith(VIEWERS_URL, { signal: expect.any(AbortSignal) });
  });

  it("écrit Serveur éteint quand le réseau échoue", async () => {
    const failing: FetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await readViewersTitle(VIEWERS_URL, failing)).toBe("Serveur\néteint");
  });

  it("écrit Serveur éteint quand le délai est dépassé", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(
      AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")),
    );
    const abortable: FetchFn = async (_url, { signal }) => {
      signal.throwIfAborted();
      return new Response('{"kind":"unknown"}');
    };
    expect(await readViewersTitle(VIEWERS_URL, abortable)).toBe("Serveur\néteint");
  });

  it("écrit Serveur à relancer quand le serveur répond une erreur HTTP, comme un 404 avant son redémarrage", async () => {
    expect(await readViewersTitle(VIEWERS_URL, answering("Not Found", 404))).toBe("Serveur\nà relancer");
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"live","count":3}', 500))).toBe(
      "Serveur\nà relancer",
    );
  });

  it("écrit Serveur à relancer quand le corps n'est pas du JSON", async () => {
    expect(await readViewersTitle(VIEWERS_URL, answering("<html>Not Found</html>"))).toBe(
      "Serveur\nà relancer",
    );
  });

  it("écrit Serveur à relancer quand le schéma refuse la réponse", async () => {
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"live","count":-2}'))).toBe(
      "Serveur\nà relancer",
    );
    expect(await readViewersTitle(VIEWERS_URL, answering('{"kind":"paused"}'))).toBe("Serveur\nà relancer");
  });
});
