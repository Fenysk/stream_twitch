import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPictureNext } from "./picture-request";
import type { FetchFn } from "./server-request";

const BASE = "http://127.0.0.1:4747";

describe("sendPictureNext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const answering =
    (body: string, status = 200): FetchFn =>
    async () =>
      new Response(body, { status });

  it("envoie un POST JSON sur la route du membre suivant, avec un délai de 10 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const requests: {
      url: string;
      method: string | undefined;
      type: string | undefined;
      body: string | undefined;
    }[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      requests.push({ url, method: init.method, type: init.headers?.["content-type"], body: init.body });
      return new Response("{}");
    };
    expect(await sendPictureNext(BASE, fetchFn)).toEqual({ ok: true });
    expect(requests).toEqual([
      { url: `${BASE}/api/obs/picture/next`, method: "POST", type: "application/json", body: "{}" },
    ]);
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("rend le refus du serveur avec son statut et sa phrase", async () => {
    const body = JSON.stringify({ issues: [{ path: "", message: "aucune image à choisir" }] });
    expect(await sendPictureNext(BASE, answering(body, 409))).toEqual({
      ok: false,
      reason: "refused",
      status: 409,
      message: "aucune image à choisir",
    });
  });

  it("rend un refus sans phrase quand le corps n'est pas celui d'un refus du serveur", async () => {
    expect(await sendPictureNext(BASE, answering("pas du json", 500))).toEqual({
      ok: false,
      reason: "refused",
      status: 500,
      message: undefined,
    });
  });

  it("dit que le serveur est injoignable quand fetch échoue", async () => {
    const down: FetchFn = async () => {
      throw new TypeError("connexion refusée");
    };
    expect(await sendPictureNext(BASE, down)).toEqual({ ok: false, reason: "unavailable" });
  });
});
