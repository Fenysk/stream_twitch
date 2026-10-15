import { afterEach, describe, expect, it, vi } from "vitest";
import { type FetchFn, readJson, requestServer } from "./server-request";

const URL_TEST = "http://127.0.0.1:4747/api/settings";

const answering =
  (body: string, status = 200): FetchFn =>
  async () =>
    new Response(body, { status });

describe("requestServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("demande en lecture avec le seul signal d'abandon, délai de 3 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchFn = vi.fn<FetchFn>(answering("{}"));
    await requestServer(URL_TEST, fetchFn);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(fetchFn).toHaveBeenCalledWith(URL_TEST, { signal: expect.any(AbortSignal) });
  });

  it("écrit en JSON déclaré : la méthode, l'en-tête content-type et le corps sérialisé", async () => {
    const fetchFn = vi.fn<FetchFn>(answering("{}"));
    await requestServer(URL_TEST, fetchFn, { method: "PUT", body: { changes: { foxShouldThank: false } } });
    expect(fetchFn).toHaveBeenCalledWith(URL_TEST, {
      signal: expect.any(AbortSignal),
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: '{"changes":{"foxShouldThank":false}}',
    });
  });

  it("laisse à une requête le délai qu'elle demande", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await requestServer(URL_TEST, answering("{}"), { method: "POST", body: {}, timeoutMs: 20_000 });
    expect(timeout).toHaveBeenCalledWith(20_000);
  });

  it("rend le statut et le corps JSON, même quand le statut est un refus", async () => {
    expect(await requestServer(URL_TEST, answering('{"issues":[]}', 422))).toEqual({
      kind: "reply",
      status: 422,
      isOk: false,
      body: { issues: [] },
    });
    expect(await requestServer(URL_TEST, answering('{"a":1}'))).toEqual({
      kind: "reply",
      status: 200,
      isOk: true,
      body: { a: 1 },
    });
  });

  it("rend un corps indéfini quand la réponse n'est pas du JSON", async () => {
    expect(await requestServer(URL_TEST, answering("<html>Not Found</html>", 404))).toEqual({
      kind: "reply",
      status: 404,
      isOk: false,
      body: undefined,
    });
  });

  it("dit que le serveur est éteint quand le réseau échoue", async () => {
    const failing: FetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await requestServer(URL_TEST, failing)).toEqual({ kind: "down" });
  });
});

describe("readJson", () => {
  it("rend le corps quand le serveur répond un JSON", async () => {
    expect(await readJson(URL_TEST, answering('{"a":1}'))).toEqual({ kind: "json", body: { a: 1 } });
  });

  it("dit que le serveur est à relancer quand il répond une erreur HTTP ou autre chose que du JSON", async () => {
    expect(await readJson(URL_TEST, answering('{"a":1}', 500))).toEqual({ kind: "to-restart" });
    expect(await readJson(URL_TEST, answering("Not Found", 404))).toEqual({ kind: "to-restart" });
    expect(await readJson(URL_TEST, answering("ok"))).toEqual({ kind: "to-restart" });
  });

  it("dit que le serveur est éteint quand le réseau échoue", async () => {
    const failing: FetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await readJson(URL_TEST, failing)).toEqual({ kind: "down" });
  });
});
